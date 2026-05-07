import { readBlockConfig } from '../../scripts/aem.js';
import { isAuthorEnvironment, moveInstrumentation } from '../../scripts/scripts.js';

const DUMMY_PRODUCT_PAYLOADS =
  {
    data: {
      securFinancialProductList: [
        { 
          productSku: 'QCjXPYxvM',
          productName: 'SecurFinancial GOLD',
          productCategory: 'Credit Cards',
          productDescription: {
            html: '<p>Free withdrawal all over the world.</p><ul><li>No annual fee for 3 transactions</li><li>Travel insurance</li><li>Insurance discount</li></ul>',
        },
          productImage: {
            _authorUrl: 'https://author-p121371-e11898531.adobeaemcloud.com/content/dam/secur-financial/en/images/Secure-credit-cards/card-gold.png',
            _publishUrl: 'https://publish-p121371-e11898531.adobeaemcloud.com/content/dam/secur-financial/en/images/Secure-credit-cards/card-gold.png',
            _dmS7Url: 'https://s7d1.scene7.com/is/image/VikasSaharanNA001/card-gold',
            _dynamicUrl: '/adobe/dynamicmedia/deliver/dm-aid--1ee615cf-90e2-4d27-a2ba-713e58e75cc7/card_gold.jpg',
          },
          _path: '/content/dam/secur-financial/en/fragments/credit-cards/securfinancial-gold',
        },
        {
          productSku: 'SVR1QAX2P',
          productName: 'SecurFinancial SILVER',
          productCategory: 'Credit Cards',
          productDescription: {
            html: '<p>Daily rewards for everyday spending.</p><ul><li>Cashback on groceries</li><li>No joining fee</li><li>Real-time spend alerts</li></ul>',
          },
          productImage: {
            _authorUrl: 'https://author-p121371-e11898531.adobeaemcloud.com/content/dam/secur-financial/en/images/Secure-credit-cards/card-basic.png',
            _publishUrl: 'https://publish-p121371-e11898531.adobeaemcloud.com/content/dam/secur-financial/en/images/Secure-credit-cards/card-basic.png',
            _dynamicUrl: '/adobe/dynamicmedia/deliver/dm-aid--dummy-2/card_basic.jpg',
          },
          _path: '/content/dam/secur-financial/en/fragments/credit-cards/securfinancial-basic',
        },
        {
          productSku: 'PLT9XJQ72',
          productName: 'SecurFinancial PLATINUM',
          productCategory: 'Credit Cards',
          productDescription: {
            html: '<p>Premium benefits for frequent travelers.</p><ul><li>Airport lounge access</li><li>Concierge support</li><li>Higher rewards multiplier</li></ul>',
          },
          productImage: {
            _authorUrl: 'https://author-p121371-e11898531.adobeaemcloud.com/content/dam/secur-financial/en/images/Secure-credit-cards/card-premium.png',
            _publishUrl: 'https://publish-p121371-e11898531.adobeaemcloud.com/content/dam/secur-financial/en/images/Secure-credit-cards/card-premium.png',
            _dynamicUrl: '/adobe/dynamicmedia/deliver/dm-aid--dummy-3/card_premium.jpg',
          },
          _path: '/content/dam/secur-financial/en/fragments/credit-cards/securfinancial-premium',
        }
      ],
      
    },
  };

function normalizeImageUrl(value) {
  if (!value) return undefined;
  const useAuthorUrl = isAuthorEnvironment();
  let url;
  if (typeof value === 'string') {
    url = value;
  } else if (useAuthorUrl) {
    url = value?._authorUrl || value?._publishUrl || value?._dynamicUrl || value?.url;
  } else {
    url = value?._publishUrl || value?._authorUrl || value?._dynamicUrl || value?.url;
  }
  if (!url) return undefined;
  try {
    return new URL(url, window.location.href).href;
  } catch (error) {
    return url;
  }
}

function normalizeProduct(rawProduct) {
  if (!rawProduct) return null;
  return {
    id: rawProduct?.productSku || rawProduct?.id || '',
    name: rawProduct?.productName || rawProduct?.name || '',
    category: rawProduct?.productCategory || rawProduct?.category || '',
    description: rawProduct?.productDescription?.html || rawProduct?.description || '',
    sku: rawProduct?.productSku || rawProduct?.sku || rawProduct?.id || '',
    image: normalizeImageUrl(rawProduct?.productImage || rawProduct?.image),
    buttonText: rawProduct?.buttonText || rawProduct?.productButtonText || rawProduct?.ctaText || rawProduct?.productCtaText || '',
    link: rawProduct?.link || rawProduct?.productLink || rawProduct?.ctaLink || rawProduct?.productCtaLink || '',
  };
}

function getDummyProducts() {
  const rawProducts = DUMMY_PRODUCT_PAYLOADS?.data?.securFinancialProductList;
  if (!Array.isArray(rawProducts) || !rawProducts.length) return [];
  const products = rawProducts
    .map((product) => normalizeProduct(product))
    .filter(Boolean);
  return products;
}

function normalizeView(value, fallback = 'stacked') {
  const normalized = String(value || '').trim().toLowerCase();
  const supported = new Set(['side-by-side', 'compact-side-by-side', 'stacked']);
  return supported.has(normalized) ? normalized : fallback;
}

function getTextFromNode(node) {
  if (!node) return '';
  const anchor = node.querySelector?.('a[href]');
  if (anchor) return (anchor.getAttribute('href') || '').trim();
  return (node.textContent || '').trim();
}

function getRowValue(row, propNames, fallbackIndex) {
  const names = Array.isArray(propNames) ? propNames : [propNames];
  for (const name of names) {
    const node = row.querySelector(`[data-aue-prop="${name}"]`);
    if (!node) continue;
    const value = getTextFromNode(node);
    if (value) return value;
  }

  if (typeof fallbackIndex !== 'number' || fallbackIndex < 0) return '';
  const cell = row.children[fallbackIndex];
  if (!cell) return '';
  const anchor = cell.querySelector('a[href]');
  if (anchor) return (anchor.getAttribute('href') || '').trim();
  const paragraph = cell.querySelector('p');
  return (paragraph?.textContent || cell.textContent || '').trim();
}

function buildChildConfigs(block) {
  const rows = [...block.children];
  const childConfigs = [];

  rows.forEach((row) => {
    const isProductItemRow = row.getAttribute('data-aue-model') === 'product-item'
      || !!row.querySelector('[data-aue-model="product-item"]')
      || !!row.querySelector('[data-aue-prop="sku"],[data-aue-prop="customStyles"],[data-aue-prop="customstyles"]');
    if (!isProductItemRow) return;

    const sku = getRowValue(row, ['sku', 'productsku'], 0);
    const customStyles = getRowValue(row, ['customStyles', 'customstyles'], 1);

    childConfigs.push({
      sku: String(sku || '').trim(),
      customStyles,
      sourceRow: row,
    });
  });

  return childConfigs;
}

function normalizeSku(value) {
  return String(value || '').trim().toLowerCase();
}

function createAuthoringFallbackProduct(index) {
  return {
    id: `authoring-item-${index + 1}`,
    name: `Product item ${index + 1}`,
    category: '',
    description: '',
    sku: '',
    image: '',
    buttonText: '',
    link: '',
  };
}

function appendProductIdToButton(anchor, product) {
  if (!anchor || !product?.sku) return;
  const productId = String(product.sku || product.id || '').trim();
  if (!productId) return;
  try {
    const url = new URL(anchor.href || window.location.href);
    url.searchParams.set('productId', productId);
    anchor.href = url.href;
  } catch (error) {
    const encodedId = encodeURIComponent(productId);
    const href = anchor.href || '';
    const separator = href.includes('?') ? '&' : '?';
    anchor.href = `${href}${separator}productId=${encodedId}`;
  }
}

function createButton(config, product) {
  const buttonLink = String(product?.link || '').trim();
  if (!buttonLink) return null;
  const buttonText = String(product?.buttonText || '').trim() || 'Learn more';

  const container = document.createElement('p');
  container.className = 'button-container';

  const styleMap = {
    button: 'cta-button',
    'button-secondary': 'cta-button-secondary',
    'button-dark': 'cta-button-dark',
    link: 'cta-link',
    default: 'cta-default',
  };
  const effectiveCtaStyle = config?.ctaStyle || '';
  const mappedStyle = styleMap[effectiveCtaStyle] || effectiveCtaStyle || 'cta-default';
  container.classList.add(mappedStyle);

  const anchor = document.createElement('a');
  anchor.className = 'button';
  anchor.textContent = buttonText;
  anchor.href = buttonLink;
  appendProductIdToButton(anchor, product);

  container.append(anchor);
  return container;
}

function createCard(product, itemConfig, defaults) {
  const li = document.createElement('li');
  const view = defaults.defaultView;
  li.classList.add('product-card-list-item', `product-card-layout-${view}`);

  const isCompactSideBySide = view === 'compact-side-by-side';
  const shouldHideDescription = isCompactSideBySide;
  const shouldAddBorder = isCompactSideBySide;

  if (shouldHideDescription) li.classList.add('product-card-hide-description');
  if (shouldAddBorder) li.classList.add('product-card-add-border');

  if (itemConfig.customStyles) {
    itemConfig.customStyles.split(/[\s,]+/).forEach((part) => {
      const cls = part.trim();
      if (cls) li.classList.add(cls);
    });
  }

  const photo = document.createElement('div');
  photo.className = 'product-card-image';
  const imageUrl = normalizeImageUrl(product.image);
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = product.name || 'Product image';
    photo.append(img);
  } else {
    photo.classList.add('product-card-image--hidden');
  }

  const body = document.createElement('div');
  body.className = 'product-card-body';

  const category = document.createElement('p');
  category.className = 'product-card-category';
  category.textContent = product.category || '';

  const name = document.createElement('h3');
  name.textContent = product.name || 'Product';

  const description = document.createElement('div');
  description.className = 'product-card-description';
  if (product.description) description.innerHTML = product.description;

  body.append(category, name, description);

  const button = createButton(itemConfig, product);
  if (button) body.append(button);

  li.append(photo, body);
  return li;
}

function appendAuthoringConfigCells(card, sourceRow) {
  if (!card || !sourceRow) return;
  const configCells = [...sourceRow.children];
  if (!configCells.length) return;

  configCells.forEach((cell) => {
    cell.classList.add('product-card-config');
    cell.style.display = 'none';
    card.append(cell);
  });
}

export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  const defaultView = normalizeView(config.defaultview || config.defaultView || 'stacked');
  const defaults = {
    defaultView,
    ctaStyle: String(config.ctastyle || '').trim(),
  };

  const childConfigs = buildChildConfigs(block);

  block.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'cards product-card-list-block';
  wrapper.classList.add(`product-card-list-view-${defaultView}`);
  const list = document.createElement('ul');
  list.className = 'product-card-list';

  // Temporarily disable API calls because current endpoint contracts return a single object shape
  // and not the array/list payload needed for this block.
  // Re-enable by switching back to the API fetch path once endpoint supports list payloads.
  const products = getDummyProducts();
  const bySku = new Map(products.map((product) => [normalizeSku(product.sku), product]));

  const mappedItems = childConfigs.map((item, index) => {
    const matchedBySku = item.sku ? bySku.get(normalizeSku(item.sku)) : null;
    const matchedByIndex = products[index] || null;
    const matchedProduct = matchedBySku || matchedByIndex || createAuthoringFallbackProduct(index);
    return {
      item: {
        ...item,
        sku: item.sku || matchedProduct.sku,
      },
      product: matchedProduct,
    };
  });

  const renderItems = mappedItems.length
    ? mappedItems
    : products.map((product) => ({
      item: {
        sku: product.sku,
      },
      product,
    }));

  renderItems.forEach(({ item, product }) => {
    const card = createCard(product, item, defaults);
    appendAuthoringConfigCells(card, item?.sourceRow);
    if (item?.sourceRow) {
      moveInstrumentation(item.sourceRow, card);
    }
    list.append(card);
  });

  wrapper.append(list);
  block.append(wrapper);
}
