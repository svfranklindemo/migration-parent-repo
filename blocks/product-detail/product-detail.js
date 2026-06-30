import { createLumaProductImagePicture, readBlockConfig } from "../../scripts/aem.js";
import { isAuthorEnvironment, normalizeCategoryValue } from "../../scripts/scripts.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { getEnvironmentValue, getHostname } from "../../scripts/utils.js";
import { label } from "../../scripts/dom-helpers.js";

const AUTHOR_PRODUCT_DETAIL_ENDPOINT = "/graphql/execute.json/dsn-eds-configuration/productDescriptionByPathAndSKU;";
const PUBLISH_GRAPHQL_PROXY_ENDPOINT = "https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information";
const PUBLISH_PRODUCT_DETAIL_ENDPOINT_KEY = "productDescriptionByPathAndSKU";
const AUTHOR_PRODUCTS_ENDPOINT = "/graphql/execute.json/dsn-eds-configuration/productsListByPath;";
const PUBLISH_PRODUCTS_ENDPOINT_KEY = "productsListByPath";
const PUBLISH_PRODUCT_DETAIL_ENDPOINT_KEY_BINJI = "productDescriptionByPathAndSKUBodea";
const PUBLISH_PRODUCTS_ENDPOINT_KEY_BINJI = "productListByPathBodea";

let productDetailAuthorBasePromise;
let productDetailPublishEnvironmentPromise;

async function getProductDetailAuthorBase() {
  if (!productDetailAuthorBasePromise) {
    productDetailAuthorBasePromise = getHostname()
      .then((hostname) => (hostname || window.location.origin || "").replace(/\/$/, ""))
      .catch(() => (window.location.origin || "").replace(/\/$/, ""));
  }
  return productDetailAuthorBasePromise;
}

async function getProductDetailPublishEnvironment() {
  if (!productDetailPublishEnvironmentPromise) {
    productDetailPublishEnvironmentPromise = getEnvironmentValue().catch(() => undefined);
  }
  return productDetailPublishEnvironmentPromise;
}

/**
 * Get query parameter from URL
 * @param {string} param - Parameter name
 * @returns {string|null} - Parameter value
 */
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Update the page title with the selected product name
 * @param {Object} product - Product data
 */
function updatePageTitle(product) {
  const productTitle = (product?.name || "").trim();
  if (productTitle) {
    document.title = productTitle;
  }
}

/**
 * Convert a sentence or text string into a hyphen-separated ID.
 * Example: "Hello World!" -> "hello-world"
 *
 * @param {string} text - Input text to convert
 * @returns {string} - Hyphen-separated ID
 */
function toHyphenId(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-')  // Replace spaces and underscores with hyphens
    .replace(/-+/g, '-');     // Collapse multiple hyphens
}

/**
 * Fetch product details from GraphQL
 * @param {string} path - Content fragment folder path
 * @param {string} sku - Product SKU
 * @param {boolean} isAuthor - Is author environment
 * @param {string} modelType - Defines which endpoint to hit
 * @returns {Promise<Object|null>} - Product data
 */
async function fetchProductDetail(path, sku, isAuthor, modelType = "default") {
  try {
    if (!path || !sku) {
      // eslint-disable-next-line no-console
      console.error("Product Detail: Missing path or SKU");
      return null;
    }
    const skuItem = isAuthor ? `;sku=${sku}` : `&sku=${sku}`;
    const authorBase = await getProductDetailAuthorBase();
    const environment = await getProductDetailPublishEnvironment();
    
    // Swap endpoint based on the modelTyKpe
    let url = isAuthor
      ? `${authorBase}${AUTHOR_PRODUCT_DETAIL_ENDPOINT}_path=${path}${skuItem}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${PUBLISH_PRODUCT_DETAIL_ENDPOINT_KEY}${environment ? `&environment=${environment}` : ''}&_path=${path};sku=${sku}`;

    if (modelType === 'video') {
      url = url.replaceAll(PUBLISH_PRODUCT_DETAIL_ENDPOINT_KEY, PUBLISH_PRODUCT_DETAIL_ENDPOINT_KEY_BINJI)?.replaceAll('sku', 'id');
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    const json = await resp.json();
    const items = json?.data?.productModelList?.items ?? json?.data?.binjiProductModelList?.items ?? [];
    return items.length > 0 ? items[0] : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Product Detail: fetch error", e);
    return null;
  }
}

/**
 * Fetch all products from a folder
 * @param {string} path - Content fragment folder path
 * @param {boolean} isAuthor - Is author environment
 * @returns {Promise<Array>} - Array of products
 */
async function fetchAllProducts(path, isAuthor, modelType = 'default') {
  try {
    if (!path) {
      return [];
    }
    const authorBase = await getProductDetailAuthorBase();
    const environment = await getProductDetailPublishEnvironment();

    let url = isAuthor
      ? `${authorBase}${AUTHOR_PRODUCTS_ENDPOINT}_path=${path}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${PUBLISH_PRODUCTS_ENDPOINT_KEY}${environment ? `&environment=${environment}` : ''}&_path=${path}`;

    if (modelType === 'video') {
      url = url.replaceAll(PUBLISH_PRODUCTS_ENDPOINT_KEY, PUBLISH_PRODUCTS_ENDPOINT_KEY_BINJI);
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    const json = await resp.json();
    const items = json?.data?.productModelList?.items || [];
    const filtered = items.filter((item) => item && item.sku);
    return filtered;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Product Detail: fetch all products error", e);
    return [];
  }
}

/**
 * Build a recommendation card
 * @param {Object} item - Product data
 * @param {boolean} isAuthor - Is author environment
 * @returns {HTMLElement} - Product card
 */
function buildRecommendationCard(item, isAuthor, recommendedPath) {
  const { id, sku, name, damImageURL = {}, category = [] } = item || {};
  const productId = sku || id || "";

  const card = document.createElement("article");
  card.className = "pd-rec-card";

  // Make card clickable and redirect to product page
  if (productId) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const currentPath = window.location.pathname;

      // Smart path construction: ensure we navigate to the correct product page
      let basePath = currentPath.substring(0, currentPath.lastIndexOf("/"));

      // If the current page doesn't have a language segment, try to add it
      const langPattern = /\/(en|fr|de|es|it|ja|zh|pt|nl|sv|da|no|fi)$/;
      if (!langPattern.test(basePath) && !basePath.includes("/en/")) {
        const pathMatch = currentPath.match(
          /\/(en|fr|de|es|it|ja|zh|pt|nl|sv|da|no|fi)\//
        );
        if (pathMatch) {
          const langCode = pathMatch[1];
          const langIndex = currentPath.indexOf(`/${langCode}/`);
          basePath = currentPath.substring(0, langIndex + langCode.length + 1);
        } else {
          basePath = `${basePath}/en`;
        }
      }

      // On author add .html extension, on publish don't
      const productPath = isAuthor
        ? `${basePath}${recommendedPath}.html`
        : `${basePath}${recommendedPath}`;
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
  imgWrap.className = "pd-rec-card-media";
  if (picture) imgWrap.append(picture);

  const meta = document.createElement("div");
  meta.className = "pd-rec-card-meta";
  const cat = document.createElement("p");
  cat.className = "pd-rec-card-category";
  cat.textContent = category
    .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
    .filter(Boolean)
    .join(" / ");
  const title = document.createElement("h3");
  title.className = "pd-rec-card-title";
  title.textContent = name || "";
  meta.append(cat, title);

  card.append(imgWrap, meta);
  return card;
}

/**
 * Build product detail view
 * @param {Object} product - Product data
 * @param {boolean} isAuthor - Is author environment
 * @param {Object} eventConfig - Configuration object including modelType
 * @returns {HTMLElement} - Product detail container
 */
function buildProductDetail(product, isAuthor, eventConfig = {}) {
  const {
    name,
    price,
    category = [],
    description = {},
    damImageURL = {},
    sku,
    id,
    video,
    poster = {},
    cast,
    age,
    image
  } = product;
  
  const modelType = eventConfig.modelType || 'default';
  
  const isPlansCategory = (category || [])
    .map((catValue) => normalizeCategoryValue(catValue).toLowerCase().trim())
    .some((catValue) => catValue === "plans" || catValue.endsWith("/plans"));

  // Update dataLayer with product information
  // If dataLayer is not ready, the update will be queued automatically
  const imageUrl = isAuthor ? damImageURL?._authorUrl : damImageURL?._publishUrl;

  const productData = {
    id: id || sku || "",
    sku: sku || "",
    name: name || "",
    price: price || 0,
    category:
      category.length > 0
        ? category
            .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
            .join(", ")
        : "",
    description: description?.html || description?.markdown || "",
    image: imageUrl || "",
    thumbnail: imageUrl || "",
  };

  if (typeof window.updateDataLayer === "function") {
    window.updateDataLayer({ product: productData });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "⚠️ window.updateDataLayer not available, product data not sent"
    );
  }

  const container = document.createElement("div");
  container.className = "pd-container";
  if (modelType === 'video') container.classList.add("pd-video-layout");

  // Image / Video section
  const imageSection = document.createElement("div");
  imageSection.className = "pd-image";

  if (modelType === 'video') {
    // 1. Render Image (above video, hidden by default via CSS)
    if (image && (image._dynamicUrl || image._publishUrl || image._authorUrl)) {
      const pictureWrapper = document.createElement("div");
      pictureWrapper.className = "pd-video-image-wrapper";
      const picture = createLumaProductImagePicture(image, name || "Product image", {
        isAuthor,
        eager: true,
      });
      if (picture) pictureWrapper.appendChild(picture);
      imageSection.appendChild(pictureWrapper);
    }

    // 2. Render Video
    if (video) {
      const videoEl = document.createElement("video");
      videoEl.controls = true;
      videoEl.className = "pd-video-player";
      
      const posterUrl = isAuthor ? poster._authorUrl : poster._publishUrl;
      if (posterUrl) videoEl.poster = posterUrl;
      
      const source = document.createElement("source");
      source.src = video;
      source.type = "video/mp4"; 
      
      videoEl.appendChild(source);
      imageSection.appendChild(videoEl);
    }
  } else if (damImageURL && (damImageURL._dynamicUrl || damImageURL._publishUrl || damImageURL._authorUrl)) {
    // Standard commerce image rendering
    const picture = createLumaProductImagePicture(damImageURL, name || "Product image", {
      isAuthor,
      eager: true,
    });
    if (picture) imageSection.appendChild(picture);
  }

  // Content section
  const contentSection = document.createElement("div");
  contentSection.className = "pd-content";

  // BINJI SPECIFIC: Meta Row (Category, Rating, Age)
  if (modelType === 'video') {
    const nameEl = document.createElement("h1");
    nameEl.className = "pd-name";
    nameEl.textContent = name || "";
    contentSection.appendChild(nameEl);

    const metaRow = document.createElement("div");
    metaRow.className = "pd-video-meta";
    
    if (category && category.length > 0) {
      const catEl = document.createElement("span");
      catEl.className = "pd-video-category-tag";
      catEl.textContent = category?.map(cat => normalizeCategoryValue(cat))?.join('/');
      metaRow.appendChild(catEl);
    }

    const ratingEl = document.createElement("div");
    ratingEl.className = "pd-video-rating Rating__content";
    ratingEl.innerHTML = `<span class="filled-stars">★ ★ ★ ★</span> <span class="empty-stars">★</span>`;
    metaRow.appendChild(ratingEl);

    if (age) {
      const ageEl = document.createElement("span");
      ageEl.className = "pd-video-age";
      ageEl.textContent = age;
      metaRow.appendChild(ageEl);
    }
    
    contentSection.appendChild(metaRow);

    if (cast) {
      const castEl = document.createElement("p");
      castEl.className = "pd-cast";
      castEl.innerHTML = `<span>Cast:</span> ${cast}`;
      contentSection.appendChild(castEl);
    }

  } else {
    // STANDARD COMMERCE
    if (category && category.length > 0) {
      const categoryText = category
        .map(
          (catValue) =>
            normalizeCategoryValue(catValue)
              .replace(/\//g, " / ") 
        )
        .join(" / ");
      const categoryEl = document.createElement("p");
      categoryEl.className = "pd-category";
      categoryEl.textContent = categoryText;
      contentSection.appendChild(categoryEl);
    }

    const nameEl = document.createElement("h1");
    nameEl.className = "pd-name";
    nameEl.textContent = name || "";
    contentSection.appendChild(nameEl);

    if (price) {
      const priceEl = document.createElement("p");
      priceEl.className = "pd-price";
      priceEl.textContent = `$${price}`;
      contentSection.appendChild(priceEl);
    }
  }

  const isHallibyTheme = document.body.classList.contains("halliby-theme");

  // Rating stars (Halliby theme only)
  if (isHallibyTheme) {
    const ratingEl = document.createElement("div");
    ratingEl.className = "pd-rating";
    ratingEl.innerHTML = `
      <span class="star filled">★</span>
      <span class="star filled">★</span>
      <span class="star filled">★</span>
      <span class="star filled">★</span>
      <span class="star empty">★</span>
    `;
    contentSection.appendChild(ratingEl);
  }

  // Description (using HTML format)
  if (description?.html) {
    const descEl = document.createElement("div");
    descEl.className = "pd-description";
    descEl.innerHTML = description.html;
    contentSection.appendChild(descEl);
  }

  // Hardcoded Extras and Quantity (Halliby theme only)
  if (eventConfig.showExtras) {
    // Extras
    const extrasEl = document.createElement("div");
    extrasEl.className = "pd-extras";
    const extrasTitle = document.createElement("h3");
    extrasTitle.className = "pd-extras-title";
    extrasTitle.textContent = "Pick Extras";
    extrasEl.appendChild(extrasTitle);

    const extrasList = document.createElement("div");
    extrasList.className = "pd-extras-list";

    const defaultExtras = [
      { id: "extra-onion", label: "Extra onion" },
      { id: "tabasco-sauce", label: "Tabasco souce" },
      { id: "grilled-tofu", label: "Grilled tofu with basil" },
      { id: "not-today", label: "Not Today" }
    ];

    const extras = eventConfig.extraOptions?.length ? eventConfig.extraOptions?.map((option) => (
        {
          id: toHyphenId(option),
          label: option
        }
    )) : defaultExtras;

    extras.forEach(extra => {
      const label = document.createElement("label");
      label.className = "pd-extra-item";
      
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "pd-extra-checkbox";
      input.name = "extras";
      input.value = extra.id;
      
      const text = document.createElement("span");
      text.className = "pd-extra-label";
      text.textContent = extra.label;
      
      label.appendChild(input);
      label.appendChild(text);
      extrasList.appendChild(label);
    });

    extrasEl.appendChild(extrasList);
    contentSection.appendChild(extrasEl);
  }

  if (eventConfig.showQuantity) {

    // Quantity
    const qtyEl = document.createElement("div");
    qtyEl.className = "pd-quantity";
    const qtyTitle = document.createElement("h3");
    qtyTitle.className = "pd-quantity-title";
    qtyTitle.textContent = "Quantity";
    qtyEl.appendChild(qtyTitle);

    const selectWrap = document.createElement("div");
    selectWrap.className = "pd-quantity-select-wrapper";
    
    const select = document.createElement("select");
    select.className = "pd-quantity-select";
    
    const placeholderOpt = document.createElement("option");
    placeholderOpt.value = "";
    placeholderOpt.textContent = "Select...";
    select.appendChild(placeholderOpt);

    for (let i = 1; i <= eventConfig.maxQuantity; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = i;
      select.appendChild(opt);
    }

    selectWrap.appendChild(select);
    qtyEl.appendChild(selectWrap);
    contentSection.appendChild(qtyEl);
  }
  

  // Action buttons
  if (modelType !== 'video') {
    const actionsEl = document.createElement("div");
    actionsEl.className = "pd-actions";
    
    // Add to Cart button (conditionally rendered)
    if (eventConfig.showAddToCartButton !== false) {
      const addToCartBtn = document.createElement("button");
      addToCartBtn.className = "pd-btn pd-btn-primary";
      addToCartBtn.textContent = "Add to Cart";
      addToCartBtn.setAttribute("aria-label", `Add ${name} to cart`);
      addToCartBtn.addEventListener("click", () => {
        const cartImageUrl = isAuthor ? damImageURL?._authorUrl : damImageURL?._publishUrl;
        const formattedCategory =
          category.length > 0
            ? category
                .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
                .join(", ")
            : "";

        window.addToCart({
          id: id || sku || "",
          name: name || "",
          image: cartImageUrl || "",
          thumbnail: cartImageUrl || "",
          category: formattedCategory,
          description: description?.html || description?.markdown || "",
          price: price || 0,
          quantity: 1,
        });
        if (eventConfig.addToCart) {
          dispatchCustomEvent(eventConfig.addToCart);
        }

        // Show visual feedback
        addToCartBtn.textContent = "Added to Cart ✓";
        setTimeout(() => {
          addToCartBtn.textContent = "Add to Cart";
        }, 2000);
      });
      actionsEl.append(addToCartBtn);
    }

    if (isPlansCategory) {
      const selectDeviceBtn = document.createElement("button");
      selectDeviceBtn.className = "pd-btn pd-btn-secondary";
      selectDeviceBtn.textContent = "Select a device";
      selectDeviceBtn.setAttribute("aria-label", "Select a device");
      selectDeviceBtn.addEventListener("click", () => {
        window.location.href = "/en/phones";
      });
      actionsEl.append(selectDeviceBtn);
    }

    if (eventConfig.showAddToWishlistButton) {
      const addToWishlistBtn = document.createElement("button");
      addToWishlistBtn.className = "pd-btn pd-btn-secondary";
      addToWishlistBtn.textContent = "Add to Wishlist";
      addToWishlistBtn.setAttribute("aria-label", `Add ${name} to wishlist`);
      addToWishlistBtn.addEventListener("click", () => {
        if (eventConfig.addToWishlist) {
          dispatchCustomEvent(eventConfig.addToWishlist);
        }
      });
      actionsEl.append(addToWishlistBtn);
    }

    contentSection.appendChild(actionsEl);
  }

  container.append(imageSection, contentSection);
  return container;
}

/**
 * Build "You May Also Like" recommendations section
 * @param {Object} currentProduct - Current product data
 * @param {Array} allProducts - All products from the folder
 * @param {boolean} isAuthor - Is author environment
 * @returns {HTMLElement|null} - Recommendations section or null
 */
function buildRecommendations(currentProduct, allProducts, isAuthor, recommendedPath, relatedProductsTitle) {
  const { sku: currentSku, category: currentCategories = [] } = currentProduct;

  if (!currentCategories || currentCategories.length === 0) {
    return null;
  }

  // Filter products by matching category
  const recommendations = allProducts
    .filter((product) => {
      // Exclude current product
      if (product.sku === currentSku) return false;

      // Check if product has any matching category
      const productCategories = product.category || [];
      return productCategories.some((cat) => currentCategories.includes(cat));
    })
    .slice(0, 5); // Limit to 5 products

  if (recommendations.length === 0) {
    return null;
  }

  // Build recommendations section
  const section = document.createElement("div");
  section.className = "pd-recommendations";

  const isHallibyTheme = document.body.classList.contains("halliby-theme");
  const title = document.createElement("h2");
  title.className = "pd-rec-title";
  title.textContent = relatedProductsTitle || "YOU MAY ALSO LIKE";

  const grid = document.createElement("div");
  grid.className = "pd-rec-grid";

  recommendations.forEach((product) => {
    const card = buildRecommendationCard(product, isAuthor, recommendedPath);
    grid.append(card);
  });

  section.append(title, grid);

  return section;
}

/**
 * Build the Recipe Detail Layout (Split Hero + 70/30 Sidebar) using BEM
 */
function buildRecipeDetail(product, allProducts, isAuthor, eventConfig = {}, recommendedPath, relatedProductsTitle) {
  const {
    name,
    description = {},
    damImageURL = {},
    authorName = "Marry Poppin", // Fallback/Mockup data
    authorRole = "Chef de Partie" // Fallback/Mockup data
  } = product;

  const imageUrl = isAuthor ? damImageURL?._authorUrl : damImageURL?._publishUrl;

  const wrapper = document.createElement("div");
  wrapper.className = "recipe-detail";

  // 1. Build the Split Hero Header
  const heroContainer = document.createElement("div");
  heroContainer.className = "recipe-hero";
  heroContainer.innerHTML = `
    <div class="recipe-hero__wrapper">
      <div class="recipe-hero__image">
        <img src="${imageUrl || ''}" alt="${name}">
      </div>
      <div class="recipe-hero__content">
        <h1 class="recipe-hero__title">${name}</h1>
      </div>
    </div>
  `;

  // 2. Build the 70/30 Content Area
  const bodyContainer = document.createElement("div");
  bodyContainer.className = "recipe-body";
  
  const bodyContent = document.createElement("div");
  bodyContent.className = "recipe-body__wrapper";

  // Left Column (70%)
  const mainSection = document.createElement("div");
  mainSection.className = "recipe-main";
  mainSection.innerHTML = `
    <h2 class="recipe-main__title">Ingredients</h2>
    <div class="recipe-main__content">
      ${description?.html || ""}
    </div>
  `;

  // Right Column (30%)
  const sidebarSection = document.createElement("div");
  sidebarSection.className = "recipe-sidebar";
  sidebarSection.innerHTML = `
    <div class="recipe-author">
      <div class="recipe-author__image">
        <img src="/assets/halliby/personas/Eli.jpg" alt="${authorName}">
      </div>
      <div class="recipe-author__content">
        <h2 class="recipe-author__name">${authorName}</h2>
        <p class="recipe-author__role">${authorRole}</p>
      </div>
    </div>
  `;

  // Inject Recommendations directly into the right sidebar container
  // Inject Standard Recommendations directly into the right sidebar container
  if (eventConfig.showYouMayAlsoLikeSection) {
    const recs = buildRecommendations(product, allProducts, isAuthor, recommendedPath, relatedProductsTitle);
    if (recs) {
      sidebarSection.appendChild(recs);
    }
  }

  bodyContent.append(mainSection, sidebarSection);
  bodyContainer.appendChild(bodyContent);
  wrapper.append(heroContainer, bodyContainer);

  return wrapper;
}

/**
 * Decorate the product detail block
 * @param {HTMLElement} block - The block element
 */
export default async function decorate(block) {
  const isTruthy = (value) => value === true || String(value || '').trim().toLowerCase() === 'true';
  const isAuthor = isAuthorEnvironment();

  // Read block config for authorable event types and folder path
  const config = readBlockConfig(block);
  const eventConfig = {
    productView: (config.productvieweventtype || config['product-view-event-type'] || '').trim(),
    addToCart: (config.addtocarteventtype || config['add-to-cart-event-type'] || '').trim(),
    addToWishlist: (config.addtoweventtype || config['add-to-wishlist-event-type'] || '').trim(),
    showAddToCartButton: (config.showaddtocartbutton === undefined && config['show-add-to-cart-button'] === undefined)
      ? true
      : isTruthy(config.showaddtocartbutton ?? config['show-add-to-cart-button']),
    showAddToWishlistButton: (config.showaddtowishlistbutton === undefined && config['show-add-to-wishlist-button'] === undefined)
      ? true
      : isTruthy(config.showaddtowishlistbutton ?? config['show-add-to-wishlist-button']),
    showYouMayAlsoLikeSection: (config.showyoumayalsolikesection === undefined && config['show-you-may-also-like-section'] === undefined)
      ? true
      : isTruthy(config.showyoumayalsolikesection ?? config['show-you-may-also-like-section']),
    modelType: config.productmodeltype || 'default',
    showExtras: isTruthy(config.showextras),
    extraOptions: config.extraoptions ? config.extraoptions?.split(',') : [],
    showQuantity: isTruthy(config.showquantity),
    maxQuantity: Number(config.maxquantity) || 1
  };

  // Extract folder path from block config
  let folderHref = "";
  const link = block.querySelector("a[href]");
  if (link) {
    folderHref = link.getAttribute("href");
  } else {
    folderHref = config.folder || "";
  }

  // Strip .html extension if present
  if (folderHref && folderHref.endsWith(".html")) {
    folderHref = folderHref.replace(/\.html$/, "");
  }

  // Get SKU from URL query parameter
  const sku = getQueryParam("productId");

  // Clear block content
  block.textContent = "";

  if (!folderHref) {
    const errorMsg = document.createElement("p");
    errorMsg.className = "pd-error";
    errorMsg.textContent =
      "Please configure the product folder path in the properties panel.";
    block.appendChild(errorMsg);
    return;
  }

  if (!sku) {
    const errorMsg = document.createElement("p");
    errorMsg.className = "pd-error";
    errorMsg.textContent = "Product not found. Missing product ID in URL.";
    block.appendChild(errorMsg);
    return;
  }

  // Show loading state
  const loader = document.createElement("p");
  loader.className = "pd-loading";
  loader.textContent = "Loading product details...";
  block.appendChild(loader);

  // Fetch product and (optionally) recommendations source data in parallel
  // Passes modelType into fetchProductDetail
  const [product, allProducts] = await Promise.all([
    fetchProductDetail(folderHref, sku, isAuthor, eventConfig.modelType),
    eventConfig.showYouMayAlsoLikeSection
      ? fetchAllProducts(folderHref, isAuthor, eventConfig.modelType)
      : Promise.resolve([]),
  ]);

  block.textContent = "";

  if (!product) {
    const errorMsg = document.createElement("p");
    errorMsg.className = "pd-error";
    errorMsg.textContent = "Product not found or failed to load.";
    block.appendChild(errorMsg);
    return;
  }

  updatePageTitle(product);

  const recommendedPath = config['pd-recommended-path'] || '/product';
  const relatedProductsTitle = config['relatedproductstitle'] || 'YOU MAY ALSO LIKE';

  if (config['alt-variation'] && isTruthy(config['alt-variation'])) {
    const recipeDetail = buildRecipeDetail(product, allProducts, isAuthor, eventConfig, recommendedPath, relatedProductsTitle);
    block.appendChild(recipeDetail);
  } else {
    // Display product detail
    const productDetail = buildProductDetail(product, isAuthor, eventConfig);
    block.appendChild(productDetail);
    
    // Display recommendations
    if (eventConfig.showYouMayAlsoLikeSection) {
      const recommendations = buildRecommendations(product, allProducts, isAuthor, recommendedPath, relatedProductsTitle);
      if (recommendations) {
        block.appendChild(recommendations);
      }
    }
  }

  if (eventConfig.productView) {
    dispatchCustomEvent(eventConfig.productView);
  }
}