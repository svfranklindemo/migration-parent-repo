import { readBlockConfig } from '../../scripts/aem.js';
import { isAuthorEnvironment, normalizeCategoryValue } from '../../scripts/scripts.js';
import { getHostname } from '../../scripts/utils.js';

const AUTHOR_GRAPHQL_BASE = '/graphql/execute.json/dsn-eds-configuration/productFeatureListByPath';
const PUBLISH_GRAPHQL_BASE = '/graphql/execute.json/dsn-eds-configuration/productFeatureListByPath';

let apiConfigPromise;

async function getApiConfig() {
  if (!apiConfigPromise) {
    apiConfigPromise = (async () => {
      const hostname = await getHostname();
      return { authorBase: (hostname || '').replace(/\/$/, '') };
    })();
  }
  return apiConfigPromise;
}

function normalizeContentFragmentPath(path, isAuthor) {
  if (!path || typeof path !== 'string') return '';
  let normalizedPath = path.trim();
  if (typeof window !== 'undefined' && window.location?.origin) {
    normalizedPath = normalizedPath.replace(window.location.origin, '');
  }
  if (isAuthor) {
    normalizedPath = normalizedPath.replace(/\.html$/i, '');
  }
  return normalizedPath;
}

// Image resolution: damFeatureImageURL takes priority over externalFeatureImageURL.
// On author env: _authorUrl → _publishUrl → _dynamicUrl
// On publish env: _publishUrl → _authorUrl → _dynamicUrl
function normalizeImageUrl(damObj, externalUrl, isAuthor) {
  if (damObj) {
    return isAuthor
      ? damObj._authorUrl || damObj._publishUrl || damObj._dynamicUrl
      : damObj._publishUrl || damObj._authorUrl || damObj._dynamicUrl;
  }
  return externalUrl || '';
}

function normalizeItem(raw, isAuthor) {
  const desc = raw.description;
  return {
    id: raw.id || raw.sku || '',
    name: raw.name || '',
    price: raw.price != null ? raw.price : null,
    category: normalizeCategoryValue(Array.isArray(raw.category) ? raw.category[0] : raw.category),
    description: !desc ? '' : (typeof desc === 'string' ? desc : (desc.html || desc.markdown || '')),
    featureImageUrl: normalizeImageUrl(raw.damFeatureImageURL, raw.externalFeatureImageURL, isAuthor),
    selectionImageUrl: normalizeImageUrl(raw.damImageUrlForSelection, raw.externalImageUrlForSelection, isAuthor),
  };
}

async function fetchProductFeatures(cfPath) {
  if (!cfPath) return [];
  const isAuthor = isAuthorEnvironment();
  try {
    const { authorBase } = await getApiConfig();
    const url = isAuthor
      ? `${authorBase}${AUTHOR_GRAPHQL_BASE};_path=${cfPath};ts=${Date.now()}`
      : `${PUBLISH_GRAPHQL_BASE};_path=${cfPath}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return [];
    const payload = await response.json();
    if (payload?.errors?.length) return [];
    const items = payload?.data?.productFeaturesModelList?.items;
    if (!Array.isArray(items) || !items.length) return [];
    return items.map((raw) => normalizeItem(raw, isAuthor)).filter(Boolean);
  } catch (e) {
    console.warn('Build Your Own GraphQL fetch failed:', e);
    return [];
  }
}

// Builds { configurator: { <category>: [selectedItem] } } for the single selected item.
function buildSelectedItemDataLayer(item) {
  const key = (item.category || 'uncategorized').toLowerCase().replace(/\s+/g, '-');
  return {
    configurator: {
      [key]: [{
        id: item.id,
        name: item.name,
        color: item.selectionImageUrl,
        image: item.featureImageUrl,
        price: item.price,
        category: item.category,
        description: item.description,
      }],
    },
  };
}

function pushToDataLayer(data) {
  if (typeof window.updateDataLayer === 'function') {
    window.updateDataLayer(data, true);
  }
}

function formatPrice(value) {
  if (value == null) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function selectItem(index, items, previewImg, summaryLabel, summaryPrice, swatches) {
  const item = items[index];
  previewImg.src = item.featureImageUrl;
  previewImg.alt = item.name;
  summaryLabel.textContent = item.name;
  summaryPrice.textContent = item.price != null ? formatPrice(item.price) : '';
  swatches.forEach((btn, i) => {
    btn.classList.toggle('is-selected', i === index);
    btn.setAttribute('aria-pressed', i === index ? 'true' : 'false');
  });
  pushToDataLayer(buildSelectedItemDataLayer(item));
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const blockTitle = config?.['block-title'] || config?.blocktitle || '';
  const cfPath = config?.['product-cf-parent-path'] || config?.productcfparentpath || '';

  block.innerHTML = '';

  const isAuthor = isAuthorEnvironment();
  const normalizedPath = normalizeContentFragmentPath(cfPath, isAuthor);
  const items = await fetchProductFeatures(normalizedPath);

  if (!items.length) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'byo-wrapper';

  // Left: preview pane
  const previewPane = document.createElement('div');
  previewPane.className = 'byo-preview-pane';
  const previewImg = document.createElement('img');
  previewImg.src = items[0].featureImageUrl;
  previewImg.alt = items[0].name;
  previewImg.className = 'byo-preview-img';
  previewPane.appendChild(previewImg);

  // Right: options pane
  const optionsPane = document.createElement('div');
  optionsPane.className = 'byo-options-pane';

  const heading = document.createElement('h2');
  heading.className = 'byo-section-title';
  heading.textContent = blockTitle;
  optionsPane.appendChild(heading);

  const swatchGrid = document.createElement('div');
  swatchGrid.className = 'byo-swatch-grid';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'byo-summary';
  const summaryLabel = document.createElement('p');
  summaryLabel.className = 'byo-summary-label';
  summaryLabel.textContent = items[0].name;
  const summaryPrice = document.createElement('p');
  summaryPrice.className = 'byo-summary-price';
  summaryPrice.textContent = items[0].price != null ? formatPrice(items[0].price) : '';
  summaryEl.appendChild(summaryLabel);
  summaryEl.appendChild(summaryPrice);

  const swatches = items.map((item, index) => {
    const btn = document.createElement('button');
    btn.className = `byo-swatch${index === 0 ? ' is-selected' : ''}`;
    btn.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    btn.setAttribute('title', item.name);
    const img = document.createElement('img');
    img.src = item.selectionImageUrl;
    img.alt = item.name;
    btn.appendChild(img);
    btn.addEventListener('click', () => selectItem(index, items, previewImg, summaryLabel, summaryPrice, swatches));
    swatchGrid.appendChild(btn);
    return btn;
  });

  optionsPane.appendChild(swatchGrid);
  optionsPane.appendChild(summaryEl);

  wrapper.appendChild(previewPane);
  wrapper.appendChild(optionsPane);
  block.appendChild(wrapper);
}
