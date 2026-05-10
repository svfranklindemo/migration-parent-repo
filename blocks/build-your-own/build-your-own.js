import { readBlockConfig } from '../../scripts/aem.js';

// Static CF payload — replace with GraphQL fetch when endpoint is ready.
// Image resolution: damFeatureImageURL takes priority over externalFeatureImageURL.
// On author env: _authorUrl → _publishUrl → _dynamicUrl
// On publish env: _publishUrl → _authorUrl → _dynamicUrl
const DUMMY_DATA = {
  data: {
    productFeaturesModelList: {
      items: [
        {
          id: 'd3HlibfkB',
          sku: 'd3HlibfkB',
          name: 'White Leather',
          price: 1050,
          category: ['frescopa:accessories'],
          description: { markdown: null, html: null },
          externalFeatureImageURL: 'https://demo-system-next.s3.amazonaws.com/assets/carvelo/configurator/interior-white.png',
          externalImageUrlForSelection: 'https://demo-system-next.s3.amazonaws.com/assets/carvelo/configurator/interior-white-small.jpg',
          damFeatureImageURL: {
            _authorUrl: 'https://author-p121371-e1189853.adobeaemcloud.com/content/dam/aem-demo-assets/en/magazine/western-australia/adobe-waadobe-wa-mg-3094.jpg',
            _publishUrl: 'https://publish-p121371-e1189853.adobeaemcloud.com/content/dam/aem-demo-assets/en/magazine/western-australia/adobe-waadobe-wa-mg-3094.jpg',
            _dynamicUrl: '/adobe/dynamicmedia/deliver/dm-aid--75be01a6-9c8b-428f-98e8-f5545e2812c0/adobe_waadobe_wa_mg_3094.jpg',
          },
          damImageUrlForSelection: {
            _authorUrl: 'https://author-p121371-e1189853.adobeaemcloud.com/content/dam/wknd-fly/en/images/240_F_313450534_bHkt5SoetREYpgWO5uOpceVnaDCngOX7.jpg',
            _publishUrl: 'https://publish-p121371-e1189853.adobeaemcloud.com/content/dam/wknd-fly/en/images/240_F_313450534_bHkt5SoetREYpgWO5uOpceVnaDCngOX7.jpg',
            _dynamicUrl: '/adobe/dynamicmedia/deliver/dm-aid--8cafcee1-32ab-46f3-be8f-4ab8fd272114/_40_F_313450534_bHkt5SoetREYpgWO5uOpceVnaDCngOX7.jpg',
          },
        },
      ],
    },
  },
};

function normalizeImageUrl(damObj, externalUrl) {
  if (damObj) {
    return damObj._publishUrl || damObj._authorUrl || damObj._dynamicUrl;
  }
  return externalUrl || '';
}

function normalizeItem(raw) {
  return {
    id: raw.id || raw.sku || '',
    name: raw.name || '',
    price: raw.price != null ? raw.price : null,
    featureImageUrl: normalizeImageUrl(raw.damFeatureImageURL, raw.externalFeatureImageURL),
    selectionImageUrl: normalizeImageUrl(raw.damImageUrlForSelection, raw.externalImageUrlForSelection),
  };
}

function getItems() {
  const raw = DUMMY_DATA?.data?.productFeaturesModelList?.items;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map(normalizeItem).filter(Boolean);
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
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const exteriorTitle = config?.exteriortitle || config?.exteriorTitle || 'Exterior';

  block.innerHTML = '';

  const items = getItems();
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
  heading.textContent = exteriorTitle;
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
