import { readBlockConfig, createLumaProductImagePicture, fetchPlaceholders } from "../../scripts/aem.js";
import { isAuthorEnvironment, normalizeAemPath, normalizeCategoryValue } from "../../scripts/scripts.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import {
  getEnvironmentValue,
  getHostname,
} from '../../scripts/utils.js';

const PUBLISH_GRAPHQL_PROXY_ENDPOINT = "https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information";
const AUTHOR_GRAPHQL_BASE = '/graphql/execute.json/dsn-eds-configuration/';
const DEFAULT_GRAPHQL_QUERY_NAME = 'productsListByPath';

// Query name comes from the project's placeholders sheet (key: query-name);
// missing sheet or row falls back to the default query.
async function getGraphQLQueryName() {
  const placeholders = await fetchPlaceholders().catch(() => ({}));
  return placeholders?.productListQueryName?.trim() || DEFAULT_GRAPHQL_QUERY_NAME;
}

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

function coerceConfigScalar(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return coerceConfigScalar(v[0]);
  return String(v).trim();
}

function getDefaultProductDetailPath(isAuthor) {
  const currentPath = window.location.pathname;
  const basePath = currentPath.substring(0, currentPath.lastIndexOf("/"));
  return isAuthor ? `${basePath}/product.html` : `${basePath}/product`;
}

function normalizeRedirectUrl(url) {
  const redirectUrl = coerceConfigScalar(url);
  if (!redirectUrl) return "";
  if (/^https?:\/\//i.test(redirectUrl)) {
    try {
      const parsedUrl = new URL(redirectUrl);
      if (!parsedUrl.pathname.startsWith("/content/")) return redirectUrl;
    } catch (e) {
      return redirectUrl;
    }
  }
  return normalizeAemPath(redirectUrl);
}

function appendProductId(url, productId) {
  if (!url || !productId) return "#";
  const [baseUrl, hash] = url.split("#");
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}productId=${encodeURIComponent(productId)}${hash ? `#${hash}` : ""}`;
}

function buildProductUrl(item, isAuthor, redirectUrl = "") {
  const productId = item?.sku || item?.id || "";
  if (!productId) return "#";
  return appendProductId(redirectUrl || getDefaultProductDetailPath(isAuthor), productId);
}

function buildCard(item, isAuthor, redirectUrl = "", enableAddToCart = false, addToCartEventType = '') {
  const { id, sku, name, damImageURL, image, category = [], price, description = {} } = item || {};
  const imgData = damImageURL || image || {};
  const productId = sku || id || "";

  const wrapper = document.createElement("div");
  wrapper.className = "cpl-card-wrapper";

  const card = document.createElement("article");
  card.className = "cpl-card";

  if (productId) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      window.location.href = buildProductUrl(item, isAuthor, redirectUrl);
    });
  }

  let picture = null;
  if (imgData && (imgData._dynamicUrl || imgData._publishUrl || imgData._authorUrl)) {
    picture = createLumaProductImagePicture(imgData, name || "Product image", {
      isAuthor,
      eager: false,
    });
  }

  const imgWrap = document.createElement("div");
  imgWrap.className = "cpl-card-media";
  if (picture) imgWrap.append(picture);

  const meta = document.createElement("div");
  meta.className = "cpl-card-meta";
  const cat = document.createElement("p");
  cat.className = "cpl-card-category";
  cat.textContent = category
    .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
    .filter(Boolean)
    .join(" / ");
  const title = document.createElement("h3");
  title.className = "cpl-card-title";
  title.textContent = name || "";
  meta.append(cat, title);

  card.append(imgWrap, meta);
  wrapper.append(card);

  if (enableAddToCart && productId) {
    const formattedCategory = category
      .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
      .join(", ");
    const cartImageUrl = isAuthor ? imgData?._authorUrl : imgData?._publishUrl;

    const addToCartBtn = document.createElement("button");
    addToCartBtn.className = "cpl-card-add-to-cart";
    addToCartBtn.textContent = "Add to Cart";
    addToCartBtn.setAttribute("aria-label", `Add ${name} to cart`);
    addToCartBtn.addEventListener("click", () => {
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
      if (addToCartEventType) dispatchCustomEvent(addToCartEventType);
      addToCartBtn.textContent = "Added to Cart ✓";
      addToCartBtn.classList.add("cpl-card-add-to-cart--added");
      setTimeout(() => {
        addToCartBtn.textContent = "Add to Cart";
        addToCartBtn.classList.remove("cpl-card-add-to-cart--added");
      }, 2000);
    });
    wrapper.append(addToCartBtn);
  }

  return wrapper;
}

async function fetchProducts(path) {
  try {
    if (!path) return [];

    const isAuthor = isAuthorEnvironment();
    const [authorBase, environment, queryName] = await Promise.all([
      getCategoryProductsAuthorBase(),
      getCategoryProductsPublishEnvironment(),
      getGraphQLQueryName(),
    ]);
    const url = isAuthor
      ? `${authorBase}${AUTHOR_GRAPHQL_BASE}${queryName};_path=${path}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${queryName}${environment ? `&environment=${environment}` : ''}&_path=${path}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    const json = await resp.json();
    return json?.data?.binjiProductModelList?.items ?? json?.data?.productModelList?.items ?? [];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Category Products Lister: fetch error", e);
    return [];
  }
}

function filterByCategories(items, tags) {
  if (!tags) return items;
  const filterList = (Array.isArray(tags) ? tags : `${tags}`.split(','))
    .map((t) => normalizeCategoryValue(`${t}`.trim()).toLowerCase())
    .filter(Boolean);
  if (!filterList.length) return items;
  return items.filter((item) => {
    let categoryTags = item.category?.length && Array.isArray(item.category) ? item.category : []; 

    if (item.shortCategory?.length && Array.isArray(item.shortCategory)) {
      categoryTags = [...categoryTags, item.shortCategory]
    }

    if (item.tags?.length && Array.isArray(item.tags)) {
      categoryTags = [...categoryTags, item.tags]
    }

    return (categoryTags).some((cat) => {
      const normalized = normalizeCategoryValue(cat).toLowerCase();
      return filterList.some((tag) => normalized.includes(tag) || tag.includes(normalized));
    })
  });
}

function readCardsPerRow(cfg, block) {
  const raw = coerceConfigScalar(cfg?.["cards-per-row"]);
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(6, Math.max(1, n));
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

function renderCarousel(block, items, cfg, isAuthor, redirectUrl = "") {
  const heading = coerceConfigScalar(cfg?.["heading"] || cfg?.["block-title"]);
  const learnMoreLabel = coerceConfigScalar(cfg?.["learn-more-label"]) || "Learn more";

  const carousel = document.createElement("div");
  carousel.className = "cpl-carousel";

  if (heading) {
    const hdr = document.createElement("div");
    hdr.className = "cpl-carousel-header";
    const h2 = document.createElement("h2");
    h2.textContent = heading;
    hdr.append(h2);
    carousel.append(hdr);
  }

  const stage = document.createElement("div");
  stage.className = "cpl-carousel-stage";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "cpl-carousel-btn cpl-carousel-btn--prev";
  prevBtn.setAttribute("aria-label", "Previous");
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "cpl-carousel-btn cpl-carousel-btn--next";
  nextBtn.setAttribute("aria-label", "Next");

  const track = document.createElement("div");
  track.className = "cpl-carousel-track";

  items.forEach((item, i) => {
    const { damImageURL, image: itemImage } = item || {};
    const imgData = damImageURL || itemImage || {};
    const slide = document.createElement("div");
    slide.className = "cpl-carousel-slide";
    if (i === 0) slide.classList.add("active");

    if (imgData && (imgData._publishUrl || imgData._authorUrl || imgData._dynamicUrl)) {
      const picture = createLumaProductImagePicture(imgData, item.name || "Product image", {
        isAuthor,
        eager: i === 0,
      });
      slide.append(picture);
    }
    track.append(slide);
  });

  stage.append(prevBtn, track, nextBtn);
  carousel.append(stage);

  const meta = document.createElement("div");
  meta.className = "cpl-carousel-meta";

  const nameEl = document.createElement("h3");
  nameEl.className = "cpl-carousel-name";
  nameEl.textContent = items[0]?.name || "";

  const learnMoreBtn = document.createElement("a");
  learnMoreBtn.className = "cpl-carousel-learn-more button";
  learnMoreBtn.textContent = learnMoreLabel;

  learnMoreBtn.href = buildProductUrl(items[0], isAuthor, redirectUrl);

  meta.append(nameEl, learnMoreBtn);
  carousel.append(meta);

  block.append(carousel);

  let current = 0;

  function goTo(index) {
    const slides = track.querySelectorAll(".cpl-carousel-slide");
    slides[current].classList.remove("active");
    current = (index + items.length) % items.length;
    slides[current].classList.add("active");
    nameEl.textContent = items[current]?.name || "";
    learnMoreBtn.href = buildProductUrl(items[current], isAuthor, redirectUrl);
  }

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));
}

export default async function decorate(block) {
  // Check if we're in author environment
  const isAuthor = isAuthorEnvironment();
  const cfg = readBlockConfig(block) || {};

  const rawRedirectUrl = cfg?.["redirect-url"] || cfg?.redirecturl || cfg?.redirectUrl;
  const redirectUrl = normalizeRedirectUrl(rawRedirectUrl);

  // Prefer the authored folder field; fall back to legacy link-only markup.
  let folderHref = cfg?.folder
    || cfg?.reference
    || cfg?.path
    || "";

  if (!folderHref && !rawRedirectUrl) {
    folderHref = block.querySelector("a[href]")?.href
      || block.querySelector("a[href]")?.textContent?.trim()
      || "";
  }

  const styleVariant = coerceConfigScalar(cfg?.style);
  if (styleVariant) block.classList.add(styleVariant);

  const noBackground = coerceConfigScalar(cfg?.["no-background"]);
  if (noBackground === "true") block.classList.add("no-background");

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
  const tags = block.dataset?.["cqTags"]
    || cfg?.cqtags
    || cfg?.cqTags
    || cfg?.tags
    || cfg?.["cq-tags"]
    || cfg?.["cq:tags"]
    || "";

  const cardsPerRow = readCardsPerRow(cfg, block);

  const enableAddToCart = (() => {
    const raw = coerceConfigScalar(cfg?.["enableaddtocartattileview"]);
    return raw.toLowerCase() === "true";
  })();

  const addToCartEventType = enableAddToCart ? (coerceConfigScalar(cfg?.["addtocarteventtype"])) : '';

  // Clear author table
  block.innerHTML = "";

  const allItems = await fetchProducts(folderHref);
  const categoryItems = filterByCategories(allItems, tags);
  let items = categoryItems;

  if (styleVariant === "carousel") {
    if (!items || items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cpl-empty";
      empty.textContent = "No products found.";
      block.append(empty);
      return;
    }
    renderCarousel(block, items, cfg, isAuthor, redirectUrl);
    return;
  }

  renderHeader(block, tags);

  const grid = document.createElement("div");
  grid.className = "cpl-grid";
  grid.style.setProperty("--cpl-columns", cardsPerRow);
  block.append(grid);

  if (!items || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cpl-empty";
    empty.textContent = "No products found.";
    grid.append(empty);
    return;
  }

  const cards = items.map((item) => (
    buildCard(item, isAuthor, redirectUrl, enableAddToCart, addToCartEventType)
  ));
  grid.append(...cards);
}