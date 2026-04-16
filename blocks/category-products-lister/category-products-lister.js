import { readBlockConfig, createLumaProductImagePicture, toClassName } from "../../scripts/aem.js";
import { isAuthorEnvironment } from "../../scripts/scripts.js";
import { getEnvironmentValue, getHostname } from "../../scripts/utils.js";

const AUTHOR_PRODUCTS_ENDPOINT = "/graphql/execute.json/dsn-eds-configuration/productsListByPath;";
const PUBLISH_GRAPHQL_PROXY_ENDPOINT = "https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information";
const PUBLISH_PRODUCTS_ENDPOINT_KEY = "productsListByPath";
let categoryProductsAuthorBasePromise;
let categoryProductsPublishEnvironmentPromise;

async function getCategoryProductsAuthorBase() {
  if (!categoryProductsAuthorBasePromise) {
    categoryProductsAuthorBasePromise = getHostname()
      .then((hostname) => (hostname || window.location.origin || "").replace(/\/$/, ""))
      .catch(() => (window.location.origin || "").replace(/\/$/, ""));
  }
  return categoryProductsAuthorBasePromise;
}

async function getCategoryProductsPublishEnvironment() {
  if (!categoryProductsPublishEnvironmentPromise) {
    categoryProductsPublishEnvironmentPromise = getEnvironmentValue().catch(() => undefined);
  }
  return categoryProductsPublishEnvironmentPromise;
}

function buildCard(item, isAuthor) {
  const { id, sku, name, damImageURL = {}, category = [] } = item || {};
  const productId = sku || id || "";

  const card = document.createElement("article");
  card.className = "cpl-card";

  // Make card clickable and redirect to product page
  if (productId) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const currentPath = window.location.pathname;
      // Replace the last segment (e.g., 'men-products') with 'product'
      const basePath = currentPath.substring(0, currentPath.lastIndexOf("/"));
      // On author add .html extension, on publish don't
      const productPath = isAuthor
        ? `${basePath}/product.html`
        : `${basePath}/product`;
      window.location.href = `${productPath}?productId=${encodeURIComponent(
        productId
      )}`;
    });
  }

  let picture = null;
  if (damImageURL && (damImageURL._dynamicUrl || damImageURL._publishUrl || damImageURL._authorUrl)) {
    picture = createLumaProductImagePicture(damImageURL, name || "Product image", {
      isAuthor,
      eager: false,
    });
  }

  const imgWrap = document.createElement("div");
  imgWrap.className = "cpl-card-media";
  if (picture) imgWrap.append(picture);

  const meta = document.createElement("div");
  meta.className = "cpl-card-meta";
  const categoryText = category && category.length ? category.join(", ") : "";
  const cat = document.createElement("p");
  cat.className = "cpl-card-category";
  // Format category: remove "luma:" or "Lumaproducts:", replace commas with slashes, uppercase
  cat.textContent = categoryText
    .replace(/^(luma:|lumaproducts:)/gi, "") // Remove luma/lumaproducts prefix (case-insensitive)
    .replace(/\//g, " / ") // Replace commas with slashes
    .toUpperCase(); // Convert to uppercase
  const title = document.createElement("h3");
  title.className = "cpl-card-title";
  title.textContent = name || "";
  meta.append(cat, title);

  card.append(imgWrap, meta);
  return card;
}

async function fetchProducts(path) {
  try {
    if (!path) return [];

    const isAuthor = isAuthorEnvironment();
    const authorBase = await getCategoryProductsAuthorBase();
    const environment = await getCategoryProductsPublishEnvironment();
    const url = isAuthor
      ? `${authorBase}${AUTHOR_PRODUCTS_ENDPOINT}_path=${path}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${PUBLISH_PRODUCTS_ENDPOINT_KEY}${environment ? `&environment=${environment}` : ''}&_path=${path}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    const json = await resp.json();
    return json?.data?.productModelList?.items || [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Category Products Lister: fetch error", e);
    return [];
  }
}

/** Normalize block config / data-aue-prop names for comparison */
function normalizeCardsConfigKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Read authored value from a UE field node (select often uses data-aue-value, not text).
 * Same idea as columns (itemAlignment) and scripts decorateTitleAlignment (alignment).
 */
function readDataAueFieldValue(el) {
  if (!el) return '';
  const fromAttr =
    el.getAttribute('data-aue-value')
    || el.getAttribute('value')
    || el.getAttribute('data-value')
    || el.dataset?.value
    || el.dataset?.aueValue;
  if (fromAttr != null && String(fromAttr).trim() !== '') {
    return String(fromAttr).trim();
  }
  // wrapTextNodes() moves data-aue-* onto an inner <p>; value is often only data-aue-value (no text).
  const nestedInstrumented = el.querySelector('[data-aue-value], [data-aue-prop]');
  if (nestedInstrumented && nestedInstrumented !== el) {
    const nestedVal = readDataAueFieldValue(nestedInstrumented);
    if (nestedVal) return nestedVal;
  }
  const sel = el.querySelector('select');
  if (sel?.value) return String(sel.value).trim();
  const opt = el.querySelector('option[selected]');
  if (opt?.value) return String(opt.value).trim();
  const plainP = el.querySelector('p');
  if (plainP) {
    const t = (plainP.textContent || '').trim();
    if (t) return t;
  }
  return (el.textContent || '').trim();
}

function coerceConfigScalar(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return coerceConfigScalar(v[0]);
  return String(v).trim();
}

/**
 * Cards per row: data-aue-prop + data-aue-value (UE), readBlockConfig table, dataset.
 */
function readCardsPerRow(block, cfg) {
  const knownProps = new Set([
    'cards-per-row',
    'cardsperrow',
    'cards-per-view',
    'cardsperview',
  ]);

  let raw = '';

  const scanAueProps = (root) => {
    if (!root) return;
    root.querySelectorAll('[data-aue-prop]').forEach((el) => {
      if (raw) return;
      const prop = normalizeCardsConfigKey(el.getAttribute('data-aue-prop'));
      const isCardsPer =
        knownProps.has(prop)
        || (prop.startsWith('cards') && (prop.includes('row') || prop.includes('view') || prop.includes('column')));
      if (!isCardsPer) return;
      const v = readDataAueFieldValue(el);
      if (v) raw = v;
    });
  };
  scanAueProps(block);
  if (!raw) scanAueProps(block.closest('.section'));

  if (!raw) {
    const explicitSelectors = [
      'p[data-aue-prop="cards-per-row"]',
      '[data-aue-prop="cards-per-row"]',
      'p[data-aue-prop="cardsPerRow"]',
      '[data-aue-prop="cardsPerRow"]',
      'p[data-aue-prop="cards-per-view"]',
      '[data-aue-prop="cards-per-view"]',
    ];
    for (const sel of explicitSelectors) {
      const el = block.querySelector(sel);
      const v = readDataAueFieldValue(el);
      if (v) {
        raw = v;
        break;
      }
    }
  }

  if (!raw && cfg && typeof cfg === 'object') {
    Object.keys(cfg).forEach((k) => {
      if (raw) return;
      const nk = normalizeCardsConfigKey(k);
      if (
        nk === 'cardsperrow'
        || nk === 'cards-per-row'
        || nk === 'cardsperview'
        || nk === 'cards-per-view'
      ) {
        raw = coerceConfigScalar(cfg[k]);
      }
    });
  }

  if (!raw) {
    raw = coerceConfigScalar(
      block.dataset?.cardsPerRow
        || block.dataset?.cardsPerView
        || block.getAttribute('data-cards-per-row')
        || block.getAttribute('data-cards-per-view'),
    );
  }

  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(6, Math.max(1, n));
}

/** Key/value rows: direct children of block, or all rows inside a single wrapper div (UE pattern). */
function getKeyValueRows(block) {
  const direct = [...block.querySelectorAll(':scope > div')];
  if (direct.length === 1) {
    const inner = [...direct[0].querySelectorAll(':scope > div')];
    if (inner.length >= 2) return inner;
  }
  return direct;
}

/**
 * Same value rules as readBlockConfig, plus UE select / data-aue-value (readBlockConfig skips native select).
 */
function readRowConfigValue(col) {
  if (!col) return '';
  if (col.querySelector('a')) {
    const as = [...col.querySelectorAll('a')];
    if (as.length === 1) return as[0].href;
    return as.map((a) => a.href);
  }
  if (col.querySelector('img')) {
    const imgs = [...col.querySelectorAll('img')];
    if (imgs.length === 1) return imgs[0].src;
    return imgs.map((img) => img.src);
  }
  const ue = readDataAueFieldValue(col);
  if (ue) return ue;
  if (col.querySelector('p')) {
    const ps = [...col.querySelectorAll('p')];
    if (ps.length === 1) return ps[0].textContent;
    return ps.map((p) => p.textContent);
  }
  return (col.textContent || '').trim();
}

/**
 * readBlockConfig only uses :scope > div and does not read native `select` or data-aue-value on the value cell.
 * Re-scan key/value rows (including single-wrapper layout) so cards-per-row and folder resolve on publish.
 */
function readCategoryProductsListerBlockConfig(block) {
  const base = readBlockConfig(block);
  const rows = getKeyValueRows(block);
  const enriched = { ...base };
  rows.forEach((row) => {
    const cols = [...row.children];
    if (cols.length < 2) return;
    const name = toClassName(cols[0].textContent);
    if (!name) return;
    enriched[name] = readRowConfigValue(cols[1]);
  });
  return enriched;
}

function renderHeader(container, selectedTags) {
  if (!selectedTags || selectedTags.length === 0) return;
  const wrap = document.createElement("div");
  wrap.className = "cpl-tags";
  const list = Array.isArray(selectedTags)
    ? selectedTags
    : `${selectedTags}`.split(",");
  list
    .map((t) => `${t}`.trim())
    .filter(Boolean)
    .forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "cpl-tag";
      chip.textContent = tag;
      wrap.append(chip);
    });
  container.append(wrap);
}

export default async function decorate(block) {
  // Check if we're in author environment
  const isAuthor = isAuthorEnvironment();

  // Extract folder path from Universal Editor authored markup
  let folderHref =
    block.querySelector("a[href]")?.href ||
    block.querySelector("a[href]")?.textContent?.trim() ||
    "";

  // Table + wrapper layouts (see readCategoryProductsListerBlockConfig)
  const cfg = readCategoryProductsListerBlockConfig(block);
  if (!folderHref) {
    folderHref = cfg?.folder || cfg?.reference || cfg?.path || "";
  }

  // Normalize folder path to pathname if an absolute URL is provided
  try {
    if (folderHref && folderHref.startsWith("http")) {
      const u = new URL(folderHref);
      folderHref = u.pathname;
    }
  } catch (e) {
    /* ignore */
  }

  // Remove .html extension if present (Universal Editor adds it)
  if (folderHref && folderHref.endsWith(".html")) {
    folderHref = folderHref.replace(/\.html$/, "");
  }

  // Extract tags - for Universal Editor they'll be in data attributes
  const tags = block.dataset?.["cqTags"] || cfg?.tags || cfg?.["cq:tags"] || "";

  // Cards per row (must read before innerHTML clear — UE uses data-aue-prop on model fields)
  const cardsPerRow = readCardsPerRow(block, cfg);

  // Clear author table
  block.innerHTML = "";

  renderHeader(block, tags);

  const grid = document.createElement("div");
  grid.className = "cpl-grid";
  grid.style.setProperty("--cpl-columns", cardsPerRow);
  block.append(grid);

  const items = await fetchProducts(folderHref);
  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cpl-empty";
    empty.textContent = "No products found.";
    grid.append(empty);
    return;
  }

  const cards = items.map((item) => buildCard(item, isAuthor));
  grid.append(...cards);
}
