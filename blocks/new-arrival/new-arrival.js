import { readBlockConfig, createLumaProductImagePicture, fetchPlaceholders } from "../../scripts/aem.js";
import { isAuthorEnvironment, normalizeCategoryValue } from "../../scripts/scripts.js";
import { getEnvironmentValue, getHostname } from "../../scripts/utils.js";

const AUTHOR_GRAPHQL_BASE = "/graphql/execute.json/dsn-eds-configuration/";
const PUBLISH_GRAPHQL_PROXY_ENDPOINT = "https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information";
const DEFAULT_GRAPHQL_QUERY_NAME = "productsListByPath";

// Query name comes from the project's placeholders sheet (key: query-name);
// missing sheet or row falls back to the default query.
async function getGraphQLQueryName() {
  const placeholders = await fetchPlaceholders().catch(() => ({}));
  return placeholders?.productListQueryName?.trim() || DEFAULT_GRAPHQL_QUERY_NAME;
}
let newArrivalAuthorBasePromise;
let newArrivalPublishEnvironmentPromise;

async function getNewArrivalAuthorBase() {
  if (!newArrivalAuthorBasePromise) {
    newArrivalAuthorBasePromise = getHostname()
      .then((hostname) => (hostname || window.location.origin || "").replace(/\/$/, ""))
      .catch(() => (window.location.origin || "").replace(/\/$/, ""));
  }
  return newArrivalAuthorBasePromise;
}

async function getNewArrivalPublishEnvironment() {
  if (!newArrivalPublishEnvironmentPromise) {
    newArrivalPublishEnvironmentPromise = getEnvironmentValue().catch(() => undefined);
  }
  return newArrivalPublishEnvironmentPromise;
}

function buildCard(item, isAuthor) {
  const { id, sku, name, damImageURL = {}, category = [], image = {} } = item || {};
  const imageData = Object.keys(damImageURL).length ? damImageURL : image;
  const productId = sku || id;

  const card = document.createElement("article");
  card.className = "na-card";

  // Make card clickable and redirect to product page
  if (productId) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const currentPath = window.location.pathname;

      // Smart path construction: ensure we navigate to the correct product page
      // Look for language code pattern (e.g., /en/, /fr/, /de/)
      let basePath = currentPath.substring(0, currentPath.lastIndexOf("/"));

      // If the current page doesn't have a language segment, try to add it
      // Check if basePath ends with a language code pattern
      const langPattern = /\/(en|fr|de|es|it|ja|zh|pt|nl|sv|da|no|fi)$/;
      if (!langPattern.test(basePath) && !basePath.includes("/en/")) {
        // Check if there's a language code in the path we can use
        const pathMatch = currentPath.match(
          /\/(en|fr|de|es|it|ja|zh|pt|nl|sv|da|no|fi)\//
        );
        if (pathMatch) {
          // Language code found in path, use it
          const langCode = pathMatch[1];
          const langIndex = currentPath.indexOf(`/${langCode}/`);
          basePath = currentPath.substring(0, langIndex + langCode.length + 1);
        } else {
          // Default to /en/ if no language code found
          basePath = `${basePath}/en`;
        }
      }

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
  if (imageData && (imageData._dynamicUrl || imageData._publishUrl || imageData._authorUrl)) {
    picture = createLumaProductImagePicture(imageData, name || "Product image", {
      isAuthor,
      eager: false,
    });
  }

  const imgWrap = document.createElement("div");
  imgWrap.className = "na-card-media";
  if (picture) imgWrap.append(picture);

  const meta = document.createElement("div");
  meta.className = "na-card-meta";
  const cat = document.createElement("p");
  cat.className = "na-card-category";
  cat.textContent = category
    .map((catValue) => normalizeCategoryValue(catValue).replace(/\//g, " / "))
    .filter(Boolean)
    .join(" / ");
  const title = document.createElement("h3");
  title.className = "na-card-title";
  title.textContent = name || "";
  meta.append(cat, title);

  card.append(imgWrap, meta);
  return card;
}

async function fetchProducts(path, isAuthor) {
  try {
    if (!path) return [];
    const [authorBase, environment, queryName] = await Promise.all([
      getNewArrivalAuthorBase(),
      getNewArrivalPublishEnvironment(),
      getGraphQLQueryName(),
    ]);
    const url = isAuthor
      ? `${authorBase}${AUTHOR_GRAPHQL_BASE}${queryName};_path=${path}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${queryName}${environment ? `&environment=${environment}` : ''}&_path=${path}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
    const json = await resp.json();
    const items = json?.data?.binjiProductModelList?.items ?? json?.data?.productModelList?.items ?? [];
    // Filter out null/invalid products
    return items.filter((item) => item && (item.sku || item.id));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("New Arrival: fetch error", e);
    return [];
  }
}

function filterProductsBySKU(products, skuList) {
  if (!skuList || skuList.length === 0) return products;

  // Normalize SKUs to lowercase for case-insensitive matching
  const normalizedSKUs = skuList.map((s) => s.toLowerCase().trim());

  return products.filter((product) => {
    const productSKU = (product.sku || product.id || "").toLowerCase().trim();
    return normalizedSKUs.includes(productSKU);
  });
}

function extractSKUs(block, cfg) {
  const skuList = [];

  // Try to extract from Universal Editor data attributes
  // With multi: true, the data comes as a string array
  const skusData = block.dataset?.skus;
  if (skusData) {
    try {
      const parsed = JSON.parse(skusData);
      if (Array.isArray(parsed)) {
        // Multi-field returns array of strings directly
        // Each string might contain comma-separated SKUs, so split them
        parsed.filter(Boolean).forEach((item) => {
          // Filter out folder paths (they start with / or contain /content/)
          if (
            typeof item === "string" &&
            !item.startsWith("/") &&
            !item.includes("/content/")
          ) {
            // Split by comma in case multiple SKUs are in one field
            const skus = item
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            skuList.push(...skus);
          }
        });
      } else if (typeof parsed === "string" && parsed) {
        // Single value - split by comma
        if (!parsed.startsWith("/") && !parsed.includes("/content/")) {
          const skus = parsed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          skuList.push(...skus);
        }
      }
    } catch (e) {
      // If not JSON, might be comma-separated string
      if (typeof skusData === "string" && skusData) {
        if (!skusData.startsWith("/") && !skusData.includes("/content/")) {
          const skus = skusData
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          skuList.push(...skus);
        }
      }
    }
  }

  // Fallback: Try to extract from block config (document-based authoring)
  if (skuList.length === 0 && cfg) {
    if (cfg.skus) {
      const skusValue = cfg.skus;
      if (Array.isArray(skusValue)) {
        skusValue.filter(Boolean).forEach((item) => {
          if (
            typeof item === "string" &&
            !item.startsWith("/") &&
            !item.includes("/content/")
          ) {
            const skus = item
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            skuList.push(...skus);
          }
        });
      } else if (typeof skusValue === "string") {
        if (!skusValue.startsWith("/") && !skusValue.includes("/content/")) {
          const skus = skusValue
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          skuList.push(...skus);
        }
      }
    }

    // Also check for other SKU-related keys
    Object.keys(cfg).forEach((key) => {
      if (key.toLowerCase().includes("sku") && key !== "skus") {
        const value = cfg[key];
        if (value && !value.startsWith("/") && !value.includes("/content/")) {
          const skus = value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          skuList.push(...skus);
        }
      }
    });
  }

  // Another fallback: parse table rows manually
  if (skuList.length === 0) {
    const rows = block.querySelectorAll(":scope > div");
    rows.forEach((row) => {
      const cells = row.querySelectorAll(":scope > div");
      cells.forEach((cell) => {
        const text = cell.textContent.trim();
        // Filter out folder paths and empty values
        if (
          text &&
          !text.toLowerCase().includes("folder") &&
          !text.startsWith("http") &&
          !text.startsWith("/") &&
          !text.includes("/content/")
        ) {
          // Split by comma in case multiple SKUs
          const skus = text
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          skuList.push(...skus);
        }
      });
    });
  }

  return skuList;
}

function createHorizontalGridLayout(block, cards) {
  const grid = document.createElement("div");
  grid.className = "na-horizontal-grid";
  cards.forEach((card) => grid.append(card));
  block.append(grid);
}

function createCarousel(block, cards) {
  const carouselWrapper = document.createElement("div");
  carouselWrapper.className = "na-carousel-wrapper";

  const carousel = document.createElement("div");
  carousel.className = "na-carousel";

  const track = document.createElement("div");
  track.className = "na-carousel-track";

  cards.forEach((card) => track.append(card));
  carousel.append(track);

  // Create navigation buttons
  const prevBtn = document.createElement("button");
  prevBtn.className = "na-carousel-btn na-carousel-btn-prev";
  prevBtn.setAttribute("aria-label", "Previous");
  prevBtn.setAttribute("type", "button");
  prevBtn.innerHTML = "‹";

  const nextBtn = document.createElement("button");
  nextBtn.className = "na-carousel-btn na-carousel-btn-next";
  nextBtn.setAttribute("aria-label", "Next");
  nextBtn.setAttribute("type", "button");
  nextBtn.innerHTML = "›";

  carouselWrapper.append(prevBtn, carousel, nextBtn);
  block.append(carouselWrapper);

  // Carousel navigation logic
  let currentIndex = 0;

  function getGapSize() {
    const width = window.innerWidth;
    // Gap values matching CSS in pixels
    if (width >= 1200) return 24; // 1.5rem
    if (width >= 900) return 20; // 1.25rem
    return 16; // 1rem
  }

  function getCardWidth() {
    const width = window.innerWidth;
    if (width <= 400) return 220;
    if (width <= 600) return 240;
    if (width <= 900) return 260;
    return 227.2;
  }

  function getWrapperPadding() {
    const width = window.innerWidth;
    // Padding values matching CSS (in pixels, converted from rem)
    if (width <= 400) return 32; // 2rem
    if (width <= 600) return 40; // 2.5rem
    if (width <= 900) return 48; // 3rem
    return 64; // 4rem (default)
  }

  function getVisibleCards() {
    if (window.innerWidth > 1200) {
      return Math.min(5, cards.length);
    }

    // Get the wrapper's inner width to determine available space
    const wrapperWidth = carouselWrapper.offsetWidth;

    // If wrapper has no width yet, use window width as fallback
    if (!wrapperWidth || wrapperWidth < 100) {
      const width = window.innerWidth;
      // Return reasonable defaults based on screen size
      if (width >= 900) return Math.min(3, cards.length);
      if (width >= 600) return Math.min(2, cards.length);
      return 1;
    }

    // Account for wrapper padding and button widths
    const wrapperPadding = getWrapperPadding() * 2; // Both sides
    const buttonWidth =
      window.innerWidth <= 600 ? 44 : window.innerWidth <= 900 ? 48 : 56;
    const buttonSpace = buttonWidth * 2; // Both buttons

    // Available space = wrapper width - padding - button space
    const availableWidth = wrapperWidth - wrapperPadding - buttonSpace;

    const cardWidth = getCardWidth();
    const gap = getGapSize();

    // Calculate how many COMPLETE cards can fit
    // Formula: floor((availableWidth + gap) / (cardWidth + gap))
    // The +gap is because the last card doesn't have a gap after it
    const visibleCards = Math.floor((availableWidth + gap) / (cardWidth + gap));

    // Ensure at least 1 card is visible and not more than total cards
    return Math.max(1, Math.min(visibleCards, cards.length));
  }

  function updateCarousel() {
    const visibleCards = getVisibleCards();
    const cardWidth = getCardWidth();
    const gap = getGapSize();
    const scrollDistance = cardWidth + gap;
    const maxIndex = Math.max(0, cards.length - visibleCards);

    currentIndex = Math.max(0, Math.min(currentIndex, maxIndex));

    // Set explicit width on carousel to show only complete cards
    // Width = (cardWidth * visibleCards) + (gap * (visibleCards - 1))
    const carouselWidth = cardWidth * visibleCards + gap * (visibleCards - 1);
    carousel.style.width = `${carouselWidth}px`;
    carousel.style.overflow = "hidden";

    const offset = -currentIndex * scrollDistance;
    track.style.transform = `translateX(${offset}px)`;

    // Update button states - only disable if we can't scroll in that direction
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex >= maxIndex || cards.length <= visibleCards;

    // Show/hide buttons based on whether scrolling is needed
    const needsScrolling = cards.length > visibleCards;
    prevBtn.style.display = needsScrolling ? "flex" : "none";
    nextBtn.style.display = needsScrolling ? "flex" : "none";
    track.classList.toggle("is-centered", !needsScrolling);
  }

  prevBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentIndex > 0) {
      currentIndex -= 1;
      updateCarousel();
    }
  });

  nextBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const visibleCards = getVisibleCards();
    const maxIndex = Math.max(0, cards.length - visibleCards);
    if (currentIndex < maxIndex) {
      currentIndex += 1;
      updateCarousel();
    }
  });

  // Handle window resize
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Reset currentIndex if it's out of bounds after resize
      const visibleCards = getVisibleCards();
      const maxIndex = Math.max(0, cards.length - visibleCards);
      currentIndex = Math.min(currentIndex, maxIndex);
      updateCarousel();
    }, 200);
  });

  // Initial update - use multiple strategies to ensure proper initialization
  // Strategy 1: Immediate requestAnimationFrame
  requestAnimationFrame(() => {
    updateCarousel();
  });

  // Strategy 2: Backup calculation after a short delay to handle slow layout
  setTimeout(() => {
    updateCarousel();
  }, 100);

  // Strategy 3: Wait for images to load if any
  const images = track.querySelectorAll("img");
  if (images.length > 0) {
    let loadedCount = 0;
    const totalImages = images.length;
    images.forEach((img) => {
      if (img.complete) {
        loadedCount++;
      } else {
        img.addEventListener("load", () => {
          loadedCount++;
          if (loadedCount === totalImages) {
            updateCarousel();
          }
        });
      }
    });
    // If all images are already loaded, recalculate
    if (loadedCount === totalImages) {
      setTimeout(() => updateCarousel(), 50);
    }
  }
}

function createVerticalLayout(block, cards) {
  const list = document.createElement("div");
  list.className = "na-vertical";
  cards.forEach((card) => list.append(card));
  block.append(list);
}

export default async function decorate(block) {
  // Check if we're in author environment
  const isAuthor = isAuthorEnvironment();

  // Extract folder path from Universal Editor authored markup
  let folderHref =
    block.querySelector("a[href]")?.href ||
    block.querySelector("a[href]")?.textContent?.trim() ||
    "";

  // Also try readBlockConfig as fallback for document-based authoring
  const cfg = readBlockConfig(block);
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

  const layout = (cfg?.layout || '').trim().toLowerCase();
  const isVertical = layout === 'vertical';
  const isHorizontalGrid = layout === 'horizontal-grid';

  // Extract SKUs from multifield
  const skuList = extractSKUs(block, cfg);

  // Clear author table
  block.innerHTML = "";

  // Fetch all products
  const allProducts = await fetchProducts(folderHref, isAuthor);

  // eslint-disable-next-line no-console
  console.log("New Arrival - All products fetched:", allProducts.length);
  // eslint-disable-next-line no-console
  console.log("New Arrival - Extracted SKUs:", skuList);

  if (!allProducts || allProducts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "na-empty";
    empty.textContent = "No products found.";
    block.append(empty);
    return;
  }

  // Filter products by SKU
  const filteredProducts = filterProductsBySKU(allProducts, skuList);

  // eslint-disable-next-line no-console
  console.log(
    "New Arrival - Filtered products:",
    filteredProducts.length,
    filteredProducts.map((p) => p.sku)
  );

  if (filteredProducts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "na-empty";
    if (skuList.length === 0) {
      empty.textContent = "Please add SKUs to filter products.";
    } else {
      empty.textContent = `No matching products found for SKUs: ${skuList.join(
        ", "
      )}`;
    }
    block.append(empty);
    return;
  }

  const cards = filteredProducts.map((item) => buildCard(item, isAuthor));

  if (isVertical) {
    createVerticalLayout(block, cards);
  } else if (isHorizontalGrid) {
    createHorizontalGridLayout(block, cards);
  } else {
    createCarousel(block, cards);
  }
}
