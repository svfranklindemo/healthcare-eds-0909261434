import { readBlockConfig } from '../../scripts/aem.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { getEnvironmentValue, getHostname } from '../../scripts/utils.js';

const FALLBACK_PRODUCT = {
  id: 'f0I76hY77',
  name: 'Checking Account',
  category: 'Accounts',
  description: '<p>Easy, anytime access.</p><ul><li>Convenient ways to pay</li><li>24/7 security</li><li>Smart money management tools</li><li>Fraud protection</li></ul>',
  sku: 'f0I76hY77',
  image: 'https://main--demo-boilerplate--lamontacrook.hlx.page/en/media_1f909a9ffb576222b96b4fdf875def856037efc95.png',
};

const AUTHOR_PRODUCT_ENDPOINT = '/graphql/execute.json/secur-financial/product-card-information';
const PUBLISH_PRODUCT_ENDPOINT = 'https://275323-918sangriatortoise.adobeioruntime.net/api/v1/web/dx-excshell-1/secure-financial-product-card-information';
const PUBLISH_ENVIRONMENT = 'p189874-e1977911';
let productCardApiConfigPromise;

async function getProductCardApiConfig() {
  if (!productCardApiConfigPromise) {
    productCardApiConfigPromise = (async () => {
      const placeholderHost = await getHostname();
      const placeholderEnvironment = await getEnvironmentValue();
      return {
        authorBase: (placeholderHost || window.location.origin || '').replace(/\/$/, ''),
        environment: placeholderEnvironment || PUBLISH_ENVIRONMENT,
      };
    })();
  }
  return productCardApiConfigPromise;
}

function revealProductCardWrapper(block) {
  const wrapperElement = block.closest('.product-card-wrapper');
  if (wrapperElement) wrapperElement.classList.add('show');
}

function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  const tokens = path.split('.');
  let current = obj;
  for (let token of tokens) {
    if (token === '') continue;
    const arrayMatch = token.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, idx] = arrayMatch;
      current = current?.[key];
      if (!Array.isArray(current)) return undefined;
      current = current[Number(idx)];
    } else {
      current = current?.[token];
    }
    if (current === undefined || current === null) return current;
  }
  return current;
}

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

function pickProductFromResponse(payload) {
  if (!payload) return undefined;

  const fallbackPaths = [
    'data.securFinancialProductByPath.item',
    'data.productCardByPath.item',
    'data.productByPath.item',
    'data.productCard.item',
    'data.productCard',
    'data.product',
    'product',
    'item',
    'items[0]',
  ];

  for (const path of fallbackPaths) {
    const resolved = resolvePath(payload, path);
    if (resolved) {
      if (Array.isArray(resolved)) {
        if (resolved.length) return resolved[0];
        continue;
      }
      return resolved;
    }
  }

  if (Array.isArray(payload)) return payload[0];
  return payload;
}

function normalizeContentFragmentPath(rawPath) {
  if (!rawPath) return '';
  let path = String(rawPath).trim();
  try {
    const parsed = new URL(path);
    path = parsed.pathname;
  } catch (error) {
    // ignore invalid URLs, treat value as relative path
  }
  const match = path.match(/(\/?content\/dam\/.+?)(?:\.html)?(?:$|\?)/);
  if (match) path = match[1];
  return path;
}

async function fetchProductData(contentFragmentPath) {
  const isAuthor = isAuthorEnvironment();
  const { authorBase, environment } = await getProductCardApiConfig();
  const pathParam = contentFragmentPath ? `path=${contentFragmentPath}` : '';
  const authorPathParam = pathParam ? `;${pathParam}` : '';
  const publishPathParam = pathParam ? `&${pathParam}` : '';
  const requestUrl = isAuthor
    ? `${authorBase}${AUTHOR_PRODUCT_ENDPOINT};ts=${Date.now()}${authorPathParam}`
    : `${PUBLISH_PRODUCT_ENDPOINT}?environment=${environment}&time=${Date.now()}${publishPathParam}`;

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
    const payload = await response.json();
    const rawProduct = pickProductFromResponse(payload);
    if (!rawProduct) return FALLBACK_PRODUCT;
    return {
      id: rawProduct?.productSku,
      name: rawProduct?.productName,
      category: rawProduct?.productCategory,
      description: rawProduct?.productDescription?.html,
      sku: rawProduct?.productSku || rawProduct?.id,
      image: normalizeImageUrl(rawProduct?.productImage)
    };
  } catch (error) {
    /* eslint-disable-next-line no-console */
    console.error('Product card API fetch failed', error);
    return FALLBACK_PRODUCT;
  }
}

function appendProductIdToButton(buttonConfig, product) {
  if (!buttonConfig?.node || !product?.sku) return buttonConfig;
  const anchor = buttonConfig.node.querySelector('a');
  if (!anchor) return buttonConfig;
  const productId = String(product.sku || product.id || '').trim();
  if (!productId) return buttonConfig;
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
  return buttonConfig;
}

function buildDatalayerProductPayload(product) {
  if (!product) return null;
  return {
    id: product.id || '',
    name: product.name || '',
    category: product.category || '',
    description: product.description || '',
    sku: product.sku || '',
  };
}

function publishProductToDataLayer(productPayload) {
  if (!productPayload || typeof window.updateDataLayer !== 'function') return;
  const productId = String(productPayload.sku || productPayload.id || '').trim();
  window.updateDataLayer(
    {
      product: { ...productPayload },
      productId,
    },
    true
  );
}

function attachProductDataLayerHandler(buttonConfig, productPayload) {
  if (!buttonConfig?.node || !productPayload) return;
  const anchor = buttonConfig.node.querySelector('a');
  if (!anchor) return;
  anchor.addEventListener('click', () => publishProductToDataLayer(productPayload));
}

function makeCardClickable(card, buttonConfig, productPayload) {
  const anchor = buttonConfig?.node?.querySelector('a[href]');
  if (!card || !anchor) return;

  card.classList.add('product-card-clickable');
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  if (anchor.target === '_blank') {
    card.setAttribute('aria-label', `${anchor.textContent || 'Open product'} (opens in a new tab)`);
  }

  const triggerAnchor = () => {
    publishProductToDataLayer(productPayload);
    anchor.click();
  };

  card.addEventListener('click', (event) => {
    if (event.target.closest('a, button, input, select, textarea, summary, label')) return;
    triggerAnchor();
  });

  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    triggerAnchor();
  });
}

function createCard(product, buttonConfig) {
  const photo = document.createElement('div');
  photo.className = 'product-card-image';
  const imageUrl = normalizeImageUrl(product.image);
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = product.name || 'Product image';
    photo.appendChild(img);
  } else {
    photo.classList.add('product-card-image--hidden');
  }

  const body = document.createElement('div');
  body.className = 'product-card-body';

  const name = document.createElement('h3');
  name.textContent = product.name || 'Product';

  const description = document.createElement('div');
  description.className = 'product-card-description';
  if (product.description) description.innerHTML = product.description;

  body.append(name, description);

  const li = document.createElement('li');
  li.append(photo, body);
  if (buttonConfig?.node) body.appendChild(buttonConfig.node);
  return li;
}

function isTruthy(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function createButtonFromConfig(config) {
  if (!config || (!config.text && !config.link)) return null;
  const container = document.createElement('p');
  container.className = 'button-container';
  const styleMap = {
    button: 'cta-button',
    'button-secondary': 'cta-button-secondary',
    'button-dark': 'cta-button-dark',
    link: 'cta-link',
    default: 'cta-default',
  };
  const mappedStyle = styleMap[config.style] || config.style;
  if (mappedStyle) container.classList.add(mappedStyle);
  const anchor = document.createElement('a');
  anchor.classList.add('button');
  anchor.textContent = config.text || 'Learn more';
  if (config.link) anchor.href = config.link;
  if (config.eventType) anchor.dataset.buttonEventType = config.eventType;
  container.appendChild(anchor);
  return { node: container };
}

export default async function decorate(block) {
  block.classList.add('product-card-block');
  [...block.children].forEach((row) => { row.style.display = 'none'; });
  try {
    const config = readBlockConfig(block) || {};
    const rawContentFragmentPath =
      config['content-fragment-folder'] || config.contentfragmentfolder || config.contentFragmentFolder || '';
    const contentFragmentPath = normalizeContentFragmentPath(rawContentFragmentPath);
    if (contentFragmentPath) {
      block.dataset.contentFragmentPath = contentFragmentPath;
    }
    const layout = ['side-by-side', 'stacked', 'compact-stacked-card'].includes((config.layout || '').toLowerCase())
      ? config.layout.toLowerCase()
      : 'stacked';
    const hideDescription = isTruthy(config.hidedescription ?? config.hideDescription);
    const addBorder = isTruthy(config.addborder ?? config.addBorder);
    const buttonConfig = createButtonFromConfig({
      text: config.buttontext,
      link: config.link,
      eventType: config.buttoneventtype,
      style: config.ctastyle ?? 'default',
    });
    [...block.children].forEach((row) => row.remove());
    block.innerHTML = '';

    const product = await fetchProductData(contentFragmentPath);
    const productPayload = buildDatalayerProductPayload(product);

    const wrapper = document.createElement('div');
    wrapper.className = 'cards product-card-block';
    wrapper.classList.add(`product-card-layout-${layout}`);
    if (hideDescription) wrapper.classList.add('product-card-hide-description');
    if (addBorder) wrapper.classList.add('product-card-add-border');
    const list = document.createElement('ul');
    const productButtonConfig = appendProductIdToButton(buttonConfig, product);
    attachProductDataLayerHandler(productButtonConfig, productPayload);
    const card = createCard(product, productButtonConfig);
    makeCardClickable(card, productButtonConfig, productPayload);
    list.append(card);
    wrapper.append(list);
    block.append(wrapper);
  } finally {
    revealProductCardWrapper(block);
  }
}
