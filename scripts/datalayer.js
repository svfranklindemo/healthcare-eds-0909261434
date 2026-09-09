// ==========================================
// DataLayer Management System - Secur Financial
// Only properties present in data-elements.json are initialized.
// No checkout (not in data-elements). Cart has only total (Reservation-TotalValue).
// ==========================================

import { fetchPlaceholders } from './aem.js';

window._dataLayerQueue = window._dataLayerQueue || [];
window._dataLayerReady = false;
window._dataLayerUpdating = false;

let _dataLayer = null;

const STORAGE_KEY = 'project_dataLayer';
const STORAGE_TIMESTAMP_KEY = 'project_dataLayer_timestamp';
const STORAGE_TTL = 30 * 24 * 60 * 60 * 1000;
const ECID_SESSION_KEY = 'com.adobe.reactor.dataElements.ECID';

function normalizePageTitle(title) {
  if (!title) return title;
  const pipeIndex = title.indexOf('|');
  return pipeIndex !== -1 ? title.slice(pipeIndex + 1).trim() : title;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target, source) {
  if (!target) {
    return isObject(source) ? { ...source } : source;
  }
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!target[key] || !isObject(target[key])) {
          output[key] = { ...source[key] };
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function getEcidFromSession() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const ecid = sessionStorage.getItem(ECID_SESSION_KEY);
      return (ecid && String(ecid).trim()) || '';
    }
  } catch (e) {
    // ignore
  }
  return '';
}

function applyEcidToDataLayer() {
  if (!_dataLayer || !_dataLayer._demosystem4) return;
  const ecid = getEcidFromSession();
  if (!_dataLayer._demosystem4.identification) _dataLayer._demosystem4.identification = {};
  const core = _dataLayer._demosystem4.identification.core;
  if (!core) {
    _dataLayer._demosystem4.identification.core = { ecid: '', email: null, loyaltyId: '', isMember: 'n' };
  }
  _dataLayer._demosystem4.identification.core.ecid = ecid || _dataLayer._demosystem4.identification.core.ecid || '';
}

function normalizeDemosystem4Email() {
  if (!_dataLayer?._demosystem4?.identification?.core) return;
  const core = _dataLayer._demosystem4.identification.core;
  if (core.email === '') core.email = null;
}

function syncWindowDataLayer() {
  window.dataLayer = _dataLayer;
}

function getPageNameFromPathname(pathname) {
  const normalized = (pathname || '').replace(/\/+$/, '');
  if (!normalized || normalized === '/') return 'home';
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length) return 'home';
  const lastSegment = (segments[segments.length - 1] || '').toLowerCase();
  const isLocaleOnly = /^[a-z]{2}(?:-[a-z]{2})?$/.test(lastSegment);
  return isLocaleOnly ? 'home' : lastSegment;
}

function dispatchDataLayerEvent(eventType = 'initialized') {
  document.dispatchEvent(
    new CustomEvent('dataLayerUpdated', {
      bubbles: true,
      detail: {
        dataLayer: JSON.parse(JSON.stringify(_dataLayer)),
        type: eventType,
      },
    })
  );
}

function processDataLayerQueue() {
  if (window._dataLayerQueue && window._dataLayerQueue.length > 0) {
    window._dataLayerQueue.forEach((queuedUpdate) => {
      const { updates, merge } = queuedUpdate;
      if (merge) {
        _dataLayer = deepMerge(_dataLayer, updates);
      } else {
        _dataLayer = { ..._dataLayer, ...updates };
      }
    });
    normalizeDemosystem4Email();
    syncWindowDataLayer();
    try {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (storageError) {
      console.warn('⚠ Could not persist dataLayer:', storageError.message);
    }
    window._dataLayerQueue = [];
    dispatchDataLayerEvent('updated');
  }
}

function executeAddToCart(productData) {
  if (!_dataLayer) {
    console.error('DataLayer not available for cart operation');
    return;
  }

  const existingCart = isObject(_dataLayer.cart) ? _dataLayer.cart : {};
  const currentCart = {
    ...existingCart,
    products: isObject(existingCart.products) ? { ...existingCart.products } : {},
    productCount: 0,
    subTotal: 0,
    total: 0,
  };

  const productKey = productData.id;
  const quantityToAdd = Math.max(1, parseInt(productData.quantity, 10) || 1);
  const unitPrice = Number(productData.price) || 0;

  if (currentCart.products[productKey]) {
    const currentQty = parseInt(currentCart.products[productKey].quantity, 10) || 0;
    const existingUnitPrice = Number(currentCart.products[productKey].price) || unitPrice;
    const nextQty = currentQty + quantityToAdd;
    currentCart.products[productKey].quantity = nextQty;
  } else {
    currentCart.products[productKey] = {
      id: productData.id,
      sku: productData.sku || productData.id,
      name: productData.name,
      image: productData.image,
      thumbnail: productData.thumbnail,
      category: productData.category,
      description: productData.description,
      quantity: quantityToAdd,
      price: unitPrice,
    };
  }

  const productValues = Object.values(currentCart.products);
  currentCart.productCount = productValues.reduce(
    (sum, p) => sum + (parseInt(p.quantity, 10) || 0),
    0,
  );
  currentCart.subTotal = productValues.reduce(
    (sum, p) => sum + ((Number(p.price) || 0) * (parseInt(p.quantity, 10) || 0)),
    0,
  );
  currentCart.total = currentCart.subTotal;

  if (typeof window.updateDataLayer === 'function') {
    window.updateDataLayer({ cart: currentCart }, false);
  } else {
    _dataLayer.cart = currentCart;
    syncWindowDataLayer();
    dispatchDataLayerEvent('updated');
  }
}

/**
 * Initial dataLayer structure only from paths in data-elements.json.
 * project: only id, currency (Project-ID, Currency). No locale.
 * cart: only total (Reservation-TotalValue).
 */
async function getInitialDataLayerFromDataElements() {
  try {
    const placeholders = await fetchPlaceholders();
    console.info('Fetched placeholders for datalayer initialization:', placeholders);
    const placeholderDataLayer = placeholders?.datalayer;
    console.info('Placeholder "datalayer" value:', placeholderDataLayer);

    if (!placeholderDataLayer) {
      console.warn('[datalayer] Placeholder "datalayer" missing. Initializing with empty dataLayer object.');
      return {};
    }

    if (typeof placeholderDataLayer === 'object') {
      console.info('[datalayer] Initial dataLayer loaded from placeholder object.');
      return placeholderDataLayer;
    }

    if (typeof placeholderDataLayer === 'string') {
      console.info('[datalayer] Initial dataLayer loaded from placeholder JSON string.');
      return JSON.parse(placeholderDataLayer);
    }

    console.warn('[datalayer] Placeholder "datalayer" has unsupported type. Initializing with empty dataLayer object.', {
      placeholderType: typeof placeholderDataLayer,
    });
  } catch (error) {
    console.warn('Error fetching placeholders for datalayer:', error);
    console.warn('[datalayer] Initializing with empty dataLayer object due to placeholder fetch/parse error.');
  }

  return {};
}

export async function buildCustomDataLayer() {
  try {
    const savedDataLayer = localStorage.getItem(STORAGE_KEY);
    const savedTimestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);

    let isDataValid = false;
    if (savedDataLayer && savedTimestamp) {
      const cacheAge = Date.now() - parseInt(savedTimestamp, 10);
      if (cacheAge <= STORAGE_TTL) {
        isDataValid = true;
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      }
    }
    if (savedDataLayer && isDataValid) {
      _dataLayer = JSON.parse(savedDataLayer);
    } else {
      console.info('[datalayer] Creating initial dataLayer from placeholder.');
      _dataLayer = await getInitialDataLayerFromDataElements();
    }
    applyEcidToDataLayer();
    if (!_dataLayer.page) _dataLayer.page = {};
    _dataLayer.page.title = normalizePageTitle(document.title) || _dataLayer.page.title;
    _dataLayer.page.name = (normalizePageTitle(document.title) || '').toLowerCase() || _dataLayer.page.name;
    syncWindowDataLayer();

    try {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (storageError) {
      console.warn('⚠ Could not persist dataLayer:', storageError.message);
    }

    window._dataLayerReady = true;
    processDataLayerQueue();

    setTimeout(() => {
      dispatchDataLayerEvent(savedDataLayer ? 'restored' : 'initialized');
    }, 0);
  } catch (error) {
    console.error('Error initializing dataLayer:', error);
    console.warn('[datalayer] Initializing with empty/placeholder data after initialization error.');
    _dataLayer = await getInitialDataLayerFromDataElements();
    syncWindowDataLayer();
    window._dataLayerReady = true;
    processDataLayerQueue();
  }
}

window.updateDataLayer = function (updates, merge = true) {
  if (!updates || typeof updates !== 'object') {
    console.error('Invalid updates provided to updateDataLayer');
    return;
  }
  if (!window._dataLayerReady || !_dataLayer) {
    window._dataLayerQueue.push({ updates, merge });
    return;
  }
  window._dataLayerUpdating = true;
  if (merge) {
    _dataLayer = deepMerge(_dataLayer, updates);
  } else {
    _dataLayer = { ..._dataLayer, ...updates };
  }
  normalizeDemosystem4Email();
  syncWindowDataLayer();
  try {
    const now = Date.now().toString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
  } catch (storageError) {
    console.warn('⚠ Could not persist dataLayer:', storageError.message);
  }
  window._dataLayerUpdating = false;
  dispatchDataLayerEvent('updated');
};

window.addToCart = function (productData) {
  if (!productData || !productData.id) {
    console.error('Invalid product data provided to addToCart');
    return;
  }

  if (!window._dataLayerReady || !_dataLayer || typeof window.updateDataLayer !== 'function') {
    console.warn('addToCart called before dataLayer was ready; cart update skipped.', { productId: productData.id });
    return;
  }

  executeAddToCart(productData);
};

window.resetDataLayerToInitial = async function (options = {}) {
  const initialDataLayer = await getInitialDataLayerFromDataElements();
  const preserveEcid = options.preserveEcid !== false;
  const updatePageContext = options.updatePageContext !== false;

  window._dataLayerUpdating = true;
  _dataLayer = JSON.parse(JSON.stringify(initialDataLayer));

  if (preserveEcid) {
    applyEcidToDataLayer();
  }

  if (updatePageContext) {
    if (!_dataLayer.page) _dataLayer.page = {};
    _dataLayer.page.title = normalizePageTitle(document.title) || _dataLayer.page.title;
    const pathName = (window.location && window.location.pathname) || '';
    _dataLayer.page.name = getPageNameFromPathname(pathName) || _dataLayer.page.name;
  }

  normalizeDemosystem4Email();
  syncWindowDataLayer();
  try {
    const now = Date.now().toString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
  } catch (storageError) {
    console.warn('⚠ Could not persist dataLayer:', storageError.message);
  }

  window._dataLayerUpdating = false;
  dispatchDataLayerEvent('replaced');
};

window.getDataLayerProperty = function (path) {
  if (!_dataLayer) return undefined;
  if (!path) return JSON.parse(JSON.stringify(_dataLayer));
  const keys = path.split('.');
  let value = _dataLayer;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  return typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
};

window.clearDataLayer = function () {
  window._dataLayerQueue = [];
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
};

window.getDataLayerQueueStatus = function () {
  return {
    ready: window._dataLayerReady,
    dataLayerQueueLength: window._dataLayerQueue ? window._dataLayerQueue.length : 0,
    dataLayerQueue: window._dataLayerQueue || [],
  };
};

// Normalize boolean/checkbox/radio to Oxygen pattern: 'y' or 'n' for dataLayer/XDM
window.getDataLayerYesNo = function (val) {
  if (val === true || val === 'y' || val === 'yes' || val === 1) return 'y';
  if (val === false || val === 'n' || val === 'no' || val === 0 || val === '' || val == null) return 'n';
  return String(val).toLowerCase() === 'y' || String(val).toLowerCase() === 'yes' ? 'y' : 'n';
};

// Normalize flight class to AEP enum (first class | business class | premium economy | economy)
window.getDataLayerFlightClass = function (val) {
  if (val == null || val === '') return '';
  const v = String(val).trim().toLowerCase();
  if (v === 'standard') return 'economy';
  if (v === 'business') return 'business class';
  if (v === 'first class' || v === 'first') return 'first class';
  if (v === 'premium economy') return 'premium economy';
  if (v === 'economy') return 'economy';
  return 'economy';
};

// Normalize flight length to integer for dataLayer/XDM (minutes)
window.getDataLayerFlightLength = function (val) {
  if (val == null || val === '') return 0;
  const n = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n));
};

// Normalize date to ISO 8601 for dataLayer/XDM (e.g. "2026-03-10T18:30:00Z" — no milliseconds)
window.getDataLayerDate = function (val) {
  if (val == null || val === '') return '';
  const s = String(val).trim();
  if (!s) return '';
  const stripMs = (iso) => (typeof iso === 'string' ? iso.replace(/\.\d{3}Z$/i, 'Z') : iso);
  if (s.indexOf('T') !== -1) return stripMs(s); // already ISO-like
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`;
  try {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : stripMs(d.toISOString());
  } catch {
    return '';
  }
};

buildCustomDataLayer();
