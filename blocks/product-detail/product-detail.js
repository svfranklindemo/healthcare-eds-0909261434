import { createLumaProductImagePicture, readBlockConfig, fetchPlaceholders } from "../../scripts/aem.js";
import { isAuthorEnvironment, normalizeCategoryValue } from "../../scripts/scripts.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { getEnvironmentValue, getHostname } from "../../scripts/utils.js";
import { label } from "../../scripts/dom-helpers.js";

const AUTHOR_GRAPHQL_ENDPOINT = "/graphql/execute.json/dsn-eds-configuration/";
const PUBLISH_GRAPHQL_PROXY_ENDPOINT = "https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information";

// Strict fallback defaults (Original Non-Binji queries)
const DEFAULT_DETAIL_QUERY = "productDescriptionByPathAndSKU";
const DEFAULT_LIST_QUERY = "productsListByPath";

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
 */
function toHyphenId(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') 
    .replace(/[\s_]+/g, '-')  
    .replace(/-+/g, '-');     
}

/**
 * Fetch product details dynamically from GraphQL
 */
async function fetchProductDetail(path, sku, isAuthor, endpointKey) {
  try {
    if (!path || !sku) {
      console.error("Product Detail: Missing path or SKU");
      return null;
    }
    
    const authorBase = await getProductDetailAuthorBase();
    const environment = await getProductDetailPublishEnvironment();
    
    // Always use sku= in the request URL
    const url = isAuthor
      ? `${authorBase}${AUTHOR_GRAPHQL_ENDPOINT}${endpointKey};_path=${path};sku=${sku}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${endpointKey}${environment ? `&environment=${environment}` : ''}&_path=${path};sku=${sku}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    const json = await resp.json();
    
    const dataValues = Object.values(json?.data || {});
    const items = dataValues.length > 0 ? dataValues[0]?.items || [] : [];
    
    return items.length > 0 ? items[0] : null;
  } catch (e) {
    console.error("Product Detail: fetch error", e);
    return null;
  }
}

/**
 * Fetch all products dynamically from a folder
 */
async function fetchAllProducts(path, isAuthor, endpointKey) {
  try {
    if (!path) {
      return [];
    }
    const authorBase = await getProductDetailAuthorBase();
    const environment = await getProductDetailPublishEnvironment();

    const url = isAuthor
      ? `${authorBase}${AUTHOR_GRAPHQL_ENDPOINT}${endpointKey};_path=${path}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${endpointKey}${environment ? `&environment=${environment}` : ''}&_path=${path}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    const json = await resp.json();
    
    const dataValues = Object.values(json?.data || {});
    const items = dataValues.length > 0 ? dataValues[0]?.items || [] : [];
    
    // We still keep item.sku || item.id here because the *returned* Bodea JSON only has 'id'
    const filtered = items.filter((item) => item && (item.sku || item.id));
    return filtered;
  } catch (e) {
    console.error("Product Detail: fetch all products error", e);
    return [];
  }
}

/**
 * Resolve the language root of the current page (e.g. "/en" or "/content/site/en").
 */
function getLanguageBasePath() {
  const currentPath = window.location.pathname;
  const langCodes = "en|fr|de|es|it|ja|zh|pt|nl|sv|da|no|fi";
  const midMatch = currentPath.match(new RegExp(`^(.*/(?:${langCodes}))/`));
  if (midMatch) return midMatch[1];
  const endMatch = currentPath.match(new RegExp(`^(.*/(?:${langCodes}))(?:\\.html)?$`));
  if (endMatch) return endMatch[1];
  return currentPath.substring(0, currentPath.lastIndexOf("/"));
}

/**
 * Build a recommendation card
 */
function buildRecommendationCard(item, isAuthor, recommendedPath) {
  const { id, sku, name, damImageURL = {}, category = [] } = item || {};
  const productId = sku || id || "";

  const card = document.createElement("article");
  card.className = "pd-rec-card";

  if (productId) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      // Normalize recommendedPath: a full URL becomes its pathname; strip .html/trailing slash.
      let target = recommendedPath || "";
      if (/^https?:\/\//i.test(target)) {
        try {
          target = new URL(target).pathname;
        } catch {
          // keep original value if parsing fails
        }
      }
      target = target.replace(/\.html$/, "").replace(/\/$/, "");

      // Prepend the language base path unless the target already includes it.
      const basePath = getLanguageBasePath();
      const includesBase = target === basePath || target.startsWith(`${basePath}/`);
      let productPath = includesBase ? target : `${basePath}/${target.replace(/^\//, "")}`;
      if (isAuthor) productPath = `${productPath}.html`;

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
    .join(", ");
  const title = document.createElement("h3");
  title.className = "pd-rec-card-title";
  title.textContent = name || "";
  meta.append(cat, title);

  card.append(imgWrap, meta);
  return card;
}

/**
 * Helper: Build Extras Section
 */
function buildExtras(eventConfig) {
  if (!eventConfig.showExtras) return null;

  const extrasEl = document.createElement("div");
  extrasEl.className = "pd-extras";
  const extrasTitle = document.createElement("h3");
  extrasTitle.className = "pd-extras-title";
  extrasTitle.textContent = "Pick Extras";
  extrasEl.appendChild(extrasTitle);

  const extrasList = document.createElement("div");
  extrasList.className = "pd-extras-list";

  const extras = eventConfig.extraOptions?.length ? eventConfig.extraOptions?.map((option) => (
      {
        id: toHyphenId(option),
        label: option
      }
  )) : [];

  if (!extras?.length) return null;

  extras.forEach(extra => {
    const labelEl = document.createElement("label");
    labelEl.className = "pd-extra-item";
    
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "pd-extra-checkbox";
    input.name = "extras";
    input.value = extra.id;
    
    const text = document.createElement("span");
    text.className = "pd-extra-label";
    text.textContent = extra.label;
    
    labelEl.appendChild(input);
    labelEl.appendChild(text);
    extrasList.appendChild(labelEl);
  });

  extrasEl.appendChild(extrasList);
  return extrasEl;
}

/**
 * Helper: Build Quantity Section
 */
function buildQuantity(eventConfig) {
  if (!eventConfig.showQuantity) return null;

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
  return qtyEl;
}

/**
 * Helper: Build Action Buttons
 */
function buildActions(product, isAuthor, eventConfig) {
  const actionsEl = document.createElement("div");
  actionsEl.className = "pd-actions";

  const { name, price, category = [], damImageURL = {}, sku, id, description = {} } = product;

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

      addToCartBtn.textContent = "Added to Cart ✓";
      setTimeout(() => {
        addToCartBtn.textContent = "Add to Cart";
      }, 2000);
    });
    actionsEl.append(addToCartBtn);
  }

  const isPlansCategory = (category || [])
    .map((catValue) => normalizeCategoryValue(catValue).toLowerCase().trim())
    .some((catValue) => catValue === "plans" || catValue.endsWith("/plans"));

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

  return actionsEl;
}

/**
 * Build product detail view
 * @param {Object} product - Product data
 * @param {boolean} isAuthor - Is author environment
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
  
  const isVideoLayout = !!video; // Intelligently trigger video layout
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
    console.warn("⚠️ window.updateDataLayer not available, product data not sent");
  }

  const container = document.createElement("div");
  container.className = "pd-container";
  if (isVideoLayout) container.classList.add("pd-video-layout");

  // Image / Video section
  const imageSection = document.createElement("div");
  imageSection.className = "pd-image";

  if (isVideoLayout) {
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

    const videoEl = document.createElement("video");
    videoEl.controls = true;
    videoEl.className = "pd-video-player";
    
    const posterUrl = isAuthor ? poster?._authorUrl : poster?._publishUrl;
    if (posterUrl) videoEl.poster = posterUrl;
    
    const source = document.createElement("source");
    source.src = video;
    source.type = "video/mp4"; 
    
    videoEl.appendChild(source);
    imageSection.appendChild(videoEl);

  } else if (damImageURL && (damImageURL._dynamicUrl || damImageURL._publishUrl || damImageURL._authorUrl)) {
    const picture = createLumaProductImagePicture(damImageURL, name || "Product image", {
      isAuthor,
      eager: true,
    });
    if (picture) imageSection.appendChild(picture);
  }

  const contentSection = document.createElement("div");
  contentSection.className = "pd-content";

  // Build Layouts Dynamically based on type
  if (isVideoLayout) {
    // Top Row (50/50 Name and Meta)
    const topRow = document.createElement("div");
    topRow.className = "pd-video-top-row";
    
    const nameEl = document.createElement("h1");
    nameEl.className = "pd-name";
    nameEl.textContent = name || "";
    topRow.appendChild(nameEl);

    const metaRow = document.createElement("div");
    metaRow.className = "pd-video-meta";
    
    if (category && category.length > 0) {
      const catEl = document.createElement("span");
      catEl.className = "pd-video-category-tag";
      catEl.textContent = category?.map(cat => normalizeCategoryValue(cat))?.join(', ');
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
    topRow.appendChild(metaRow);
    contentSection.appendChild(topRow); // Append Row 1

    // Build standard body elements
    let castEl = null;
    if (cast) {
      castEl = document.createElement("p");
      castEl.className = "pd-cast";
      castEl.innerHTML = `<span>Cast:</span> ${cast}`;
    }

    let descEl = null;
    if (description?.html) {
      descEl = document.createElement("div");
      descEl.className = "pd-description";
      descEl.innerHTML = description.html;
    }

    // Build actionable elements
    const extrasEl = buildExtras(eventConfig);
    const qtyEl = buildQuantity(eventConfig);
    const actionsEl = buildActions(product, isAuthor, eventConfig);

    // Conditionally Split Layout if actionable items exist
    const hasSidebar = extrasEl || qtyEl || actionsEl.children.length > 0;

    if (hasSidebar) {
      const splitLayout = document.createElement("div");
      splitLayout.className = "pd-video-split-layout";
      
      const leftCol = document.createElement("div");
      leftCol.className = "pd-video-left-col";
      if (castEl) leftCol.appendChild(castEl);
      if (descEl) leftCol.appendChild(descEl);

      const rightCol = document.createElement("div");
      rightCol.className = "pd-video-right-col";
      if (extrasEl) rightCol.appendChild(extrasEl);
      if (qtyEl) rightCol.appendChild(qtyEl);
      if (actionsEl.children.length > 0) rightCol.appendChild(actionsEl);

      splitLayout.append(leftCol, rightCol);
      contentSection.appendChild(splitLayout); // Append Row 2 (Split)
    } else {
      // Default Stacked if no extras/quantity/actions
      if (castEl) contentSection.appendChild(castEl);
      if (descEl) contentSection.appendChild(descEl);
    }

  } else {
    // STANDARD COMMERCE
    if (category && category.length > 0) {
      const categoryText = category
        .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
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

    const isHallibyTheme = document.body.classList.contains("halliby-theme");
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

    if (description?.html) {
      const descEl = document.createElement("div");
      descEl.className = "pd-description";
      descEl.innerHTML = description.html;
      contentSection.appendChild(descEl);
    }

    const extrasEl = buildExtras(eventConfig);
    if (extrasEl) contentSection.appendChild(extrasEl);

    const qtyEl = buildQuantity(eventConfig);
    if (qtyEl) contentSection.appendChild(qtyEl);

    const actionsEl = buildActions(product, isAuthor, eventConfig);
    if (actionsEl.children.length > 0) contentSection.appendChild(actionsEl);
  }

  container.append(imageSection, contentSection);
  return container;
}

/**
 * Build "You May Also Like" recommendations section
 */
function buildRecommendations(currentProduct, allProducts, isAuthor, recommendedPath, relatedProductsTitle) {
  const { sku, id, category: currentCategories = [] } = currentProduct;
  const currentProductId = sku || id;

  if (!currentCategories || currentCategories.length === 0) {
    return null;
  }

  const recommendations = allProducts
    .filter((product) => {
      const productId = product.sku || product.id;
      if (productId === currentProductId) return false;
      const productCategories = product.category || [];
      return productCategories.some((cat) => currentCategories.includes(cat));
    })
    .slice(0, 5);

  if (recommendations.length === 0) {
    return null;
  }

  const section = document.createElement("div");
  section.className = "pd-recommendations";

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

  const bodyContainer = document.createElement("div");
  bodyContainer.className = "recipe-body";
  
  const bodyContent = document.createElement("div");
  bodyContent.className = "recipe-body__wrapper";

  const mainSection = document.createElement("div");
  mainSection.className = "recipe-main";
  mainSection.innerHTML = `
    <h2 class="recipe-main__title">${eventConfig.ingredientsTitle}</h2>
    <div class="recipe-main__content">
      ${description?.html || ""}
    </div>
  `;

  const extrasEl = buildExtras(eventConfig);
  if (extrasEl) mainSection.appendChild(extrasEl);

  const qtyEl = buildQuantity(eventConfig);
  if (qtyEl) mainSection.appendChild(qtyEl);

  const actionsEl = buildActions(product, isAuthor, eventConfig);
  if (actionsEl.children.length > 0) mainSection.appendChild(actionsEl);

  // Right Column (30%)
  const sidebarSection = document.createElement("div");
  sidebarSection.className = "recipe-sidebar";
  
  if (eventConfig.showRecipeAuthor) {
    sidebarSection.innerHTML = `
      <div class="recipe-author">
        <div class="recipe-author__image">
          <img src="/content/dam/halliby/en/images/recipe-author.jpg" alt="${authorName}">
        </div>
        <div class="recipe-author__content">
          <h2 class="recipe-author__name">${authorName}</h2>
          <p class="recipe-author__role">${authorRole}</p>
        </div>
      </div>
    `;
  }

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
 */
export default async function decorate(block) {
  const isTruthy = (value) => value === true || String(value || '').trim().toLowerCase() === 'true';
  const isAuthor = isAuthorEnvironment();

  const config = readBlockConfig(block);
  const eventConfig = {
    productView: (config.productvieweventtype || config['product-view-event-type'] || '').trim(),
    addToCart: (config.addtocarteventtype || config['add-to-cart-event-type'] || '').trim(),
    addToWishlist: (config.addtowishlisteventtype || config['add-to-wishlist-event-type'] || '').trim(),
    showAddToCartButton: (config.showaddtocartbutton === undefined && config['show-add-to-cart-button'] === undefined)
      ? true
      : isTruthy(config.showaddtocartbutton ?? config['show-add-to-cart-button']),
    showAddToWishlistButton: (config.showaddtowishlistbutton === undefined && config['show-add-to-wishlist-button'] === undefined)
      ? true
      : isTruthy(config.showaddtowishlistbutton ?? config['show-add-to-wishlist-button']),
    showYouMayAlsoLikeSection: (config.showyoumayalsolikesection === undefined && config['show-you-may-also-like-section'] === undefined)
      ? true
      : isTruthy(config.showyoumayalsolikesection ?? config['show-you-may-also-like-section']),
    showExtras: isTruthy(config.showextras),
    extraOptions: config.extraoptions ? config.extraoptions?.split(',') : [],
    showQuantity: isTruthy(config.showquantity),
    maxQuantity: Number(config.maxquantity) || 1,
    ingredientsTitle: config.ingredientstitle || config['ingredients-title'] || 'Ingredients',
    showRecipeAuthor: isTruthy(config.showrecipeauthor ?? config['show-recipe-author'])
  };

  let folderHref = "";
  const link = block.querySelector("a[href]");
  if (link) {
    folderHref = link.getAttribute("href");
  } else {
    folderHref = config.folder || "";
  }

  if (folderHref && folderHref.endsWith(".html")) {
    folderHref = folderHref.replace(/\.html$/, "");
  }

  const sku = getQueryParam("productId");

  block.textContent = "";

  if (!folderHref) {
    const errorMsg = document.createElement("p");
    errorMsg.className = "pd-error";
    errorMsg.textContent = "Please configure the product folder path in the properties panel.";
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

  const loader = document.createElement("p");
  loader.className = "pd-loading";
  loader.textContent = "Loading product details...";
  block.appendChild(loader);

  // Fetch placeholders gracefully
  let placeholders = {};
  try {
    placeholders = await fetchPlaceholders();
  } catch (e) {
    console.warn("Product Detail: Could not fetch placeholders, falling back to default queries.");
  }

  // Extract strings directly from placeholders with strict defaults
  const detailEndpointKey = placeholders.productDetailQueryName || DEFAULT_DETAIL_QUERY;
  const listEndpointKey = placeholders.productListQueryName || DEFAULT_LIST_QUERY;

  // Fetch product and recommendations using the plain endpoint keys
  const [product, allProducts] = await Promise.all([
    fetchProductDetail(folderHref, sku, isAuthor, detailEndpointKey),
    eventConfig.showYouMayAlsoLikeSection
      ? fetchAllProducts(folderHref, isAuthor, listEndpointKey)
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
    const productDetail = buildProductDetail(product, isAuthor, eventConfig);
    block.appendChild(productDetail);
    
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