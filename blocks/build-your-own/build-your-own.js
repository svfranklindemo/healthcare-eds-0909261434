import { readBlockConfig } from '../../scripts/aem.js';
import { isAuthorEnvironment, normalizeCategoryValue } from '../../scripts/scripts.js';
import { getEnvironmentValue, getHostname } from '../../scripts/utils.js';

const AUTHOR_GRAPHQL_BASE = '/graphql/execute.json/dsn-eds-configuration/productFeatureListByPath';
const PUBLISH_GRAPHQL_PROXY_ENDPOINT = 'https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/fetch-product-information';
const PUBLISH_PRODUCTS_ENDPOINT_KEY = 'productFeatureListByPath';

let authorBasePromise;
let publishEnvironmentPromise;

async function getAuthorBase() {
  if (!authorBasePromise) {
    authorBasePromise = getHostname()
      .then((hostname) => (hostname || window.location.origin || '').replace(/\/$/, ''))
      .catch(() => (window.location.origin || '').replace(/\/$/, ''));
  }
  return authorBasePromise;
}

async function getPublishEnvironment() {
  if (!publishEnvironmentPromise) {
    publishEnvironmentPromise = getEnvironmentValue().catch(() => undefined);
  }
  return publishEnvironmentPromise;
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
    const authorBase = await getAuthorBase();
    const environment = await getPublishEnvironment();
    const url = isAuthor
      ? `${authorBase}${AUTHOR_GRAPHQL_BASE};_path=${cfPath};ts=${Date.now()}`
      : `${PUBLISH_GRAPHQL_PROXY_ENDPOINT}?endpoint=${PUBLISH_PRODUCTS_ENDPOINT_KEY}${environment ? `&environment=${environment}` : ''}&_path=${cfPath}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
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

const ADDON_CLASS_MAP = {
  'advance-driver-assistance-button': 'advancedDriverAssistance',
  'convenience-package-button': 'conveniencePackage',
};

const addonState = {
  advancedDriverAssistance: false,
  conveniencePackage: false,
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest(
    '.advance-driver-assistance-button .button-container a.button, .convenience-package-button .button-container a.button',
  );
  if (!btn) return;

  e.preventDefault();
  const card = btn.closest('.cards > ul > li');
  const addonClass = Object.keys(ADDON_CLASS_MAP).find((cls) => card.classList.contains(cls));
  const key = ADDON_CLASS_MAP[addonClass];
  addonState[key] = !addonState[key];
  pushToDataLayer({ configurator: { ...addonState } });
});

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

function groupByCategory(items) {
  const map = new Map();
  items.forEach((item) => {
    const cat = item.category || 'uncategorized';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(item);
  });
  return map;
}

function buildCategorySection(categoryName, categoryItems) {
  const section = document.createElement('div');
  section.className = 'byo-category-section';

  const heading = document.createElement('h1');
  heading.className = 'byo-section-title';
  heading.textContent = categoryName;
  section.appendChild(heading);

  const wrapper = document.createElement('div');
  wrapper.className = 'byo-wrapper';

  const previewPane = document.createElement('div');
  previewPane.className = 'byo-preview-pane';
  const previewImg = document.createElement('img');
  previewImg.src = categoryItems[0].featureImageUrl;
  previewImg.alt = categoryItems[0].name;
  previewImg.className = 'byo-preview-img';
  previewPane.appendChild(previewImg);

  const optionsPane = document.createElement('div');
  optionsPane.className = 'byo-options-pane';

  const swatchGrid = document.createElement('div');
  swatchGrid.className = 'byo-swatch-grid';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'byo-summary';
  const summaryLabel = document.createElement('p');
  summaryLabel.className = 'byo-summary-label';
  summaryLabel.textContent = categoryItems[0].name;
  const summaryPrice = document.createElement('p');
  summaryPrice.className = 'byo-summary-price';
  summaryPrice.textContent = categoryItems[0].price != null ? formatPrice(categoryItems[0].price) : '';
  summaryEl.appendChild(summaryLabel);
  summaryEl.appendChild(summaryPrice);

  const swatches = categoryItems.map((item, index) => {
    const btn = document.createElement('button');
    btn.className = `byo-swatch${index === 0 ? ' is-selected' : ''}`;
    btn.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    btn.setAttribute('title', item.name);
    const img = document.createElement('img');
    img.src = item.selectionImageUrl;
    img.alt = item.name;
    btn.appendChild(img);
    btn.addEventListener('click', () => selectItem(index, categoryItems, previewImg, summaryLabel, summaryPrice, swatches));
    swatchGrid.appendChild(btn);
    return btn;
  });

  optionsPane.appendChild(swatchGrid);
  optionsPane.appendChild(summaryEl);
  wrapper.appendChild(previewPane);
  wrapper.appendChild(optionsPane);
  section.appendChild(wrapper);

  return section;
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

  if (blockTitle) {
    const mainHeading = document.createElement('h1');
    mainHeading.className = 'byo-main-title';
    mainHeading.textContent = blockTitle;
    block.appendChild(mainHeading);
  }

  const categoryMap = groupByCategory(items);
  categoryMap.forEach((categoryItems, categoryName) => {
    block.appendChild(buildCategorySection(categoryName, categoryItems));
  });

}
