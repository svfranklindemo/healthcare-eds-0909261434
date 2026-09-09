/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env browser */
function sampleRUM(checkpoint, data) {
  // eslint-disable-next-line max-len
  const timeShift = () => (window.performance ? window.performance.now() : Date.now() - window.hlx.rum.firstReadTime);
  try {
    window.hlx = window.hlx || {};
    sampleRUM.enhance = () => {};
    if (!window.hlx.rum) {
      const param = new URLSearchParams(window.location.search).get('rum');
      const weight = (window.SAMPLE_PAGEVIEWS_AT_RATE === 'high' && 10)
        || (window.SAMPLE_PAGEVIEWS_AT_RATE === 'low' && 1000)
        || (param === 'on' && 1)
        || 100;
      const id = Math.random().toString(36).slice(-4);
      const isSelected = param !== 'off' && Math.random() * weight < 1;
      // eslint-disable-next-line object-curly-newline, max-len
      window.hlx.rum = {
        weight,
        id,
        isSelected,
        firstReadTime: window.performance ? window.performance.timeOrigin : Date.now(),
        sampleRUM,
        queue: [],
        collector: (...args) => window.hlx.rum.queue.push(args),
      };
      if (isSelected) {
        const dataFromErrorObj = (error) => {
          const errData = { source: 'undefined error' };
          try {
            errData.target = error.toString();
            errData.source = error.stack
              .split('\n')
              .filter((line) => line.match(/https?:\/\//))
              .shift()
              .replace(/at ([^ ]+) \((.+)\)/, '$1@$2')
              .replace(/ at /, '@')
              .trim();
          } catch (err) {
            /* error structure was not as expected */
          }
          return errData;
        };

        window.addEventListener('error', ({ error }) => {
          const errData = dataFromErrorObj(error);
          sampleRUM('error', errData);
        });

        window.addEventListener('unhandledrejection', ({ reason }) => {
          let errData = {
            source: 'Unhandled Rejection',
            target: reason || 'Unknown',
          };
          if (reason instanceof Error) {
            errData = dataFromErrorObj(reason);
          }
          sampleRUM('error', errData);
        });

        sampleRUM.baseURL = sampleRUM.baseURL || new URL(window.RUM_BASE || '/', new URL('https://rum.hlx.page'));
        sampleRUM.collectBaseURL = sampleRUM.collectBaseURL || sampleRUM.baseURL;
        sampleRUM.sendPing = (ck, time, pingData = {}) => {
          // eslint-disable-next-line max-len, object-curly-newline
          const rumData = JSON.stringify({
            weight,
            id,
            referer: window.location.href,
            checkpoint: ck,
            t: time,
            ...pingData,
          });
          const urlParams = window.RUM_PARAMS
            ? `?${new URLSearchParams(window.RUM_PARAMS).toString()}`
            : '';
          const { href: url, origin } = new URL(
            `.rum/${weight}${urlParams}`,
            sampleRUM.collectBaseURL,
          );
          const body = origin === window.location.origin
            ? new Blob([rumData], { type: 'application/json' })
            : rumData;
          navigator.sendBeacon(url, body);
          // eslint-disable-next-line no-console
          console.debug(`ping:${ck}`, pingData);
        };
        sampleRUM.sendPing('top', timeShift());

        sampleRUM.enhance = () => {
          // only enhance once
          if (document.querySelector('script[src*="rum-enhancer"]')) return;
          const { enhancerVersion, enhancerHash } = sampleRUM.enhancerContext || {};
          const script = document.createElement('script');
          if (enhancerHash) {
            script.integrity = enhancerHash;
            script.setAttribute('crossorigin', 'anonymous');
          }
          script.src = new URL(
            `.rum/@adobe/helix-rum-enhancer@${enhancerVersion || '^2'}/src/index.js`,
            sampleRUM.baseURL,
          ).href;
          document.head.appendChild(script);
        };
        if (!window.hlx.RUM_MANUAL_ENHANCE) {
          sampleRUM.enhance();
        }
      }
    }
    if (window.hlx.rum && window.hlx.rum.isSelected && checkpoint) {
      window.hlx.rum.collector(checkpoint, data, timeShift());
    }
    document.dispatchEvent(new CustomEvent('rum', { detail: { checkpoint, data } }));
  } catch (error) {
    // something went awry
  }
}

/**
 * Setup block utils.
 */
function setup() {
  window.hlx = window.hlx || {};
  window.hlx.RUM_MASK_URL = 'full';
  window.hlx.RUM_MANUAL_ENHANCE = true;
  window.hlx.codeBasePath = '';
  window.hlx.lighthouse = new URLSearchParams(window.location.search).get('lighthouse') === 'on';

  const scriptEl = document.querySelector('script[src$="/scripts/scripts.js"]');
  if (scriptEl) {
    try {
      const scriptURL = new URL(scriptEl.src, window.location);
      if (scriptURL.host === window.location.host) {
        [window.hlx.codeBasePath] = scriptURL.pathname.split('/scripts/scripts.js');
      } else {
        [window.hlx.codeBasePath] = scriptURL.href.split('/scripts/scripts.js');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
    }
  }
}
/**
 * Protects the AEM Sidekick from being opened by default
 */
function hideSidekick() {
  // Check if URL contains required ZDP parameters
  const urlParams = new URLSearchParams(window.location.search);
  const hasZdpId = urlParams.has('zdp-id');
  const hasZdpEnv = urlParams.has('zdp-env');
  const hasZdpToken = urlParams.has('zdp-token');
  
  // Only proceed if all required ZDP parameters are present
  if (!hasZdpId || !hasZdpEnv || !hasZdpToken) {
    console.log('ZDP parameters not found, skipping sidekick hiding');
    return;
  }
  
  const sidekick = document.querySelector('aem-sidekick');
  
  if (sidekick) {
    // Sidekick found, hide it if open
    if (sidekick.hasAttribute('open')) {
      console.log('hiding sidekick');
      sidekick.setAttribute('open', false);
    }
  } else {
    // Sidekick not found yet, watch for it to be added
    console.log('sidekick not found, watching for it...');
    
    const observer = new MutationObserver((mutations, obs) => {
      const sidekickElement = document.querySelector('aem-sidekick');
      if (sidekickElement) {
        console.log('sidekick found by observer, hiding...');
        if (sidekickElement.hasAttribute('open')) {
          sidekickElement.setAttribute('open', false);
        }
        obs.disconnect(); // Stop observing once found
      }
    });
    
    // Watch body for added child nodes
    observer.observe(document.body, {
      childList: true,
      subtree: false
    });
    
    // Stop observing after 10 seconds as a safety measure
    setTimeout(() => observer.disconnect(), 10000);
  }
}
/**
 * Auto initialization.
 */

function init() {
  setup();
  sampleRUM.collectBaseURL = window.origin;
  sampleRUM();
  setupSectionItemWidthsUE();
  setupBlockCustomClassUE();
}

/**
 * Sanitizes a string for use as class name.
 * @param {string} name The unsanitized string
 * @returns {string} The class name
 */
function toClassName(name) {
  return typeof name === 'string'
    ? name
      .toLowerCase()
      .replace(/[^0-9a-z]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    : '';
}

/**
 * Sanitizes a string for use as a js property name.
 * @param {string} name The unsanitized string
 * @returns {string} The camelCased name
 */
function toCamelCase(name) {
  return toClassName(name).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Extracts the config from a block.
 * @param {Element} block The block element
 * @returns {object} The block config
 */
// eslint-disable-next-line import/prefer-default-export
// authors may put the real destination as an absolute URL in the link text (e.g. when EDS
// strips protocol+host off links to other EDS-hosted sites) — trust it over href when present
export function resolveAnchorValue(anchor) {
  const hrefAttr = (anchor.getAttribute('href') || '').trim();
  const text = (anchor.textContent || '').trim();
  if (/^https?:\/\//i.test(text) && !/^https?:\/\//i.test(hrefAttr)) {
    try {
      // eslint-disable-next-line no-new
      new URL(text);
      return text;
    } catch {
      /* not a valid absolute URL, ignore */
    }
  }
  return anchor.href;
}

function readBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children) {
      const cols = [...row.children];
      if (cols[1]) {
        const col = cols[1];
        const name = toClassName(cols[0].textContent);
        let value = '';
        if (col.querySelector('a')) {
          const as = [...col.querySelectorAll('a')];
          if (as.length === 1) {
            value = resolveAnchorValue(as[0]);
          } else {
            value = as.map(resolveAnchorValue);
          }
        } else if (col.querySelector('img')) {
          const imgs = [...col.querySelectorAll('img')];
          if (imgs.length === 1) {
            value = imgs[0].src;
          } else {
            value = imgs.map((img) => img.src);
          }
        } else if (col.querySelector('p')) {
          const ps = [...col.querySelectorAll('p')];
          if (ps.length === 1) {
            value = ps[0].textContent;
          } else {
            value = ps.map((p) => p.textContent);
          }
        } else value = row.children[1].textContent;
        config[name] = value;
      }
    }
  });
  return config;
}

/**
 * Loads a CSS file.
 * @param {string} href URL to the CSS file
 */
async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

/**
 * Loads a non module JS file.
 * @param {string} src URL to the JS file
 * @param {Object} attrs additional optional attributes
 */
async function loadScript(src, attrs) {
  return new Promise((resolve, reject) => {
    if (!src || src.trim() === '') {
      resolve();
      return;
    }

    if (!document.querySelector(`head > script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      if (attrs) {
        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const attr in attrs) {
          script.setAttribute(attr, attrs[attr]);
        }
      }
      script.onload = resolve;
      // script.onerror = reject;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.append(script);
    } else {
      resolve();
    }
  });
}

/**
 * Retrieves the content of metadata tags.
 * @param {string} name The metadata name (or property)
 * @param {Document} doc Document object to query for metadata. Defaults to the window's document
 * @returns {string} The metadata value(s)
 */
function getMetadata(name, doc = document) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = [...doc.head.querySelectorAll(`meta[${attr}="${name}"]`)]
    .map((m) => m.content)
    .join(', ');
  return meta || '';
}

/**
 * Absolute href for AEM web-optimized image delivery (`ImageRef._dynamicUrl`).
 * @param {{ _dynamicUrl?: string, _publishUrl?: string, _authorUrl?: string }} damImageURL
 * @returns {string|null}
 * @see https://experienceleague.adobe.com/en/docs/experience-manager-learn/getting-started-with-aem-headless/how-to/images
 */
function resolveAemDynamicImageHref(damImageURL, isAuthor = false) {
  const { _dynamicUrl, _publishUrl, _authorUrl } = damImageURL || {};
  if (!_dynamicUrl) return null;
  const originRef = isAuthor ? _authorUrl : (_publishUrl);
  try {
    if (_dynamicUrl.startsWith('http://') || _dynamicUrl.startsWith('https://')) {
      return _dynamicUrl;
    }
    if (!originRef) return null;
    const { origin } = new URL(originRef);
    const path = _dynamicUrl.startsWith('/') ? _dynamicUrl : `/${_dynamicUrl}`;
    return `${origin}${path}`;
  } catch {
    return null;
  }
}

/**
 * Responsive product image using AEM `_dynamicUrl` + `width` query params (srcset + sizes).
 * Returns null if `_dynamicUrl` is missing (persisted GraphQL must request it on `ImageRef`).
 * @param {{ _dynamicUrl?: string, _publishUrl?: string, _authorUrl?: string }} damImageURL
 * @param {string} alt
 * @param {boolean} eager
 * @param {number[]} widths Descending not required; sorted internally
 * @param {string} sizes
 * @param {string|null} fetchpriority
 * @returns {HTMLPictureElement|null}
 */
function createResponsiveAemDamPicture(
  damImageURL,
  alt = '',
  eager = false,
  widths = [320, 640],
  sizes = '200px',
  fetchpriority = null,
  isAuthor = false
) {
  const baseHref = resolveAemDynamicImageHref(damImageURL, isAuthor);
  if (!baseHref) return null;

  const sorted = [...widths].sort((a, b) => b - a);
  const picture = document.createElement('picture');
  const img = document.createElement('img');
  img.alt = alt;
  img.loading = eager ? 'eager' : 'lazy';
  if (eager || fetchpriority) {
    img.setAttribute('fetchpriority', fetchpriority || 'high');
  }
  img.setAttribute('sizes', sizes);

  const parts = sorted.map((w) => {
    try {
      const u = new URL(baseHref);
      u.searchParams.set('width', String(w));
      if (!u.searchParams.has('preferwebp')) u.searchParams.set('preferwebp', 'true');
      return `${u.href} ${w}w`;
    } catch {
      return null;
    }
  }).filter(Boolean);
  if (!parts.length) return null;
  img.setAttribute('srcset', parts.join(', '));

  try {
    const fallback = new URL(baseHref);
    fallback.searchParams.set('width', String(sorted[sorted.length - 1]));
    if (!fallback.searchParams.has('preferwebp')) fallback.searchParams.set('preferwebp', 'true');
    img.src = fallback.href;
  } catch {
    return null;
  }

  picture.appendChild(img);
  return picture;
}

/**
 * Luma product listing vs PDP image: prefers AEM web-optimized `_dynamicUrl` when GraphQL returns it.
 * @param {{ _dynamicUrl?: string, _publishUrl?: string, _authorUrl?: string }} damImageURL
 * @param {string} alt
 * @param {{ isAuthor?: boolean, eager?: boolean }} options eager=true uses larger renditions (PDP hero)
 * @returns {HTMLPictureElement|null}
 */
function createLumaProductImagePicture(damImageURL, alt = '', { isAuthor = false, eager = false } = {}) {
  if (damImageURL?._dynamicUrl && (damImageURL._publishUrl || damImageURL._authorUrl)) {
    const listingWidths = [240, 480];
    const detailWidths = [480, 960, 1200];
    const listingSizes = '(max-width: 768px) 42vw, 220px';
    const detailSizes = '(max-width: 900px) 100vw, min(640px, 55vw)';
    const widths = eager ? detailWidths : listingWidths;
    const sizes = eager ? detailSizes : listingSizes;
    const pic = createResponsiveAemDamPicture(damImageURL, alt, eager, widths, sizes, null, isAuthor);
    if (pic) return pic;
  }

  const imgUrl = isAuthor ? damImageURL?._authorUrl : damImageURL?._publishUrl;
  if (!imgUrl) return null;

  if (!isAuthor && imgUrl.startsWith('http')) {
    const picture = document.createElement('picture');
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = alt;
    img.loading = eager ? 'eager' : 'lazy';
    if (eager) img.setAttribute('fetchpriority', 'high');
    picture.appendChild(img);
    return picture;
  }

  const breakpoints = eager
    ? [
      { media: '(min-width: 900px)', width: '800' },
      { media: '(min-width: 600px)', width: '600' },
      { width: '400' },
    ]
    : [
      { media: '(min-width: 900px)', width: '600' },
      { media: '(min-width: 600px)', width: '400' },
      { width: '320' },
    ];
  return createOptimizedPicture(imgUrl, alt, eager, breakpoints);
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {string} [alt] The image alternative text
 * @param {boolean} [eager] Set loading attribute to eager
 * @param {Array} [breakpoints] Breakpoints and corresponding params (eg. width)
 * @returns {Element} The picture element
 */
function createOptimizedPicture(
  src,
  alt = '',
  eager = false,
  breakpoints = [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }],
  fetchpriority = null,
) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webply&optimize=medium`);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      if (fetchpriority || eager) {
        img.setAttribute('fetchpriority', fetchpriority || 'high');
      }
      img.setAttribute('alt', alt);
      picture.appendChild(img);
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
    }
  });

  return picture;
}

/**
 * Set template (page structure) and theme (page styles).
 */
function decorateTemplateAndTheme() {
  const addClasses = (element, classes) => {
    classes.split(',').forEach((c) => {
      element.classList.add(toClassName(c.trim()));
    });
  };
  const template = getMetadata('template');
  if (template) addClasses(document.body, template);
  const theme = getMetadata('theme');
  if (theme) addClasses(document.body, theme);
}

/**
 * Wrap inline text content of block cells within a <p> tag.
 * @param {Element} block the block element
 */
function wrapTextNodes(block) {
  const validWrappers = [
    'P',
    'PRE',
    'UL',
    'OL',
    'PICTURE',
    'TABLE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
  ];

  const wrap = (el) => {
    const wrapper = document.createElement('p');
    wrapper.append(...el.childNodes);
    [...el.attributes]
      // move the instrumentation from the cell to the new paragraph, also keep the class
      // in case the content is a buttton and the cell the button-container
      .filter(({ nodeName }) => nodeName === 'class'
        || nodeName.startsWith('data-aue')
        || nodeName.startsWith('data-richtext'))
      .forEach(({ nodeName, nodeValue }) => {
        wrapper.setAttribute(nodeName, nodeValue);
        el.removeAttribute(nodeName);
      });
    el.append(wrapper);
  };

  block.querySelectorAll(':scope > div > div').forEach((blockColumn) => {
    if (blockColumn.hasChildNodes()) {
      const hasWrapper = !!blockColumn.firstElementChild
        && validWrappers.some((tagName) => blockColumn.firstElementChild.tagName === tagName);
      if (!hasWrapper) {
        wrap(blockColumn);
      } else if (
        blockColumn.firstElementChild.tagName === 'PICTURE'
        && (blockColumn.children.length > 1 || !!blockColumn.textContent.trim())
      ) {
        wrap(blockColumn);
      }
    }
  });
}

/**
 * Decorates paragraphs containing a single link as buttons.
 * @param {Element} element container element
 */
function decorateButtons(element) {
  const isAuthor = window?.location?.origin?.includes('author');
  element.querySelectorAll('a').forEach((a) => {
    a.title = a.title || a.textContent;
    if (isAuthor) {
      const href = a.getAttribute('href') || '';
      let skip = false;
      if (/^https?:\/\//i.test(href)) {
        try {
          const parsedHref = new URL(href);
          // external/absolute URL (different origin or not a /content/ path) — leave untouched
          skip = parsedHref.origin !== window.location.origin || !parsedHref.pathname.startsWith('/content/');
        } catch {
          skip = true;
        }
      }
      // author-mode requires .html, but the server can't resolve .html appended after a query string
      if (!skip) {
        const [pathname, suffix = ''] = href.match(/^([^?#]*)([?#].*)?$/).slice(1);
        if (pathname && !pathname.toLowerCase().endsWith('.html')) {
          a.setAttribute('href', `${pathname}.html${suffix}`);
        }
      }
    }
    if (a.href !== a.textContent) {
      const up = a.parentElement;
      const twoup = a.parentElement.parentElement;
      if (!a.querySelector('img')) {
        if (up.childNodes.length === 1 && (up.tagName === 'P' || up.tagName === 'DIV')) {
          a.className = 'button'; // default
          up.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'STRONG'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.className = 'button primary';
          twoup.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'EM'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.className = 'button secondary';
          twoup.classList.add('button-container');
        }
      }
    }
  });
}

/**
 * Add <img> for icon, prefixed with codeBasePath and optional prefix.
 * @param {Element} [span] span element with icon classes
 * @param {string} [prefix] prefix to be added to icon src
 * @param {string} [alt] alt text to be added to icon
 */
function decorateIcon(span, prefix = '', alt = '') {
  const iconName = Array.from(span.classList)
    .find((c) => c.startsWith('icon-'))
    .substring(5);
  const img = document.createElement('img');
  img.dataset.iconName = iconName;
  img.src = `${window.hlx.codeBasePath}${prefix}/icons/${iconName}.svg`;
  img.alt = alt;
  img.loading = 'lazy';
  img.width = 16;
  img.height = 16;
  span.append(img);
}

/**
 * Add <img> for icons, prefixed with codeBasePath and optional prefix.
 * @param {Element} [element] Element containing icons
 * @param {string} [prefix] prefix to be added to icon the src
 */
function decorateIcons(element, prefix = '') {
  const icons = element.querySelectorAll('span.icon');
  icons.forEach((span) => {
    decorateIcon(span, prefix);
  });
}

/**
 * Decorates all sections in a container element.
 * @param {Element} main The container element
 */
function decorateSections(main) {
  main.querySelectorAll(':scope > div:not([data-section-status])').forEach((section) => {
    const wrappers = [];
    let defaultContent = false;
    [...section.children].forEach((e) => {
      if ((e.tagName === 'DIV' && e.className) || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV' || !e.className;
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1].append(e);
    });
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.dataset.sectionStatus = 'initialized';
    section.style.display = 'none';

    // Process section metadata
    const sectionMeta = section.querySelector('div.section-metadata');
    if (sectionMeta) {
      const meta = readBlockConfig(sectionMeta);
      Object.keys(meta).forEach((key) => {
        if (key === 'style') {
          const styles = meta.style
            .split(',')
            .filter((style) => style)
            .map((style) => toClassName(style.trim()));
          styles.forEach((style) => section.classList.add(style));
        } else {
          section.dataset[toCamelCase(key)] = meta[key];
        }
      });
      sectionMeta.parentNode.remove();

      // Section text color from UE field (same pattern as hero; key may be sec-color or section-text-color from label)
      applySectionBackgroundImage(section, meta['sec-bg-image'] ?? meta.image);
      applySectionTextColor(section, meta['sec-color'] ?? meta['section-text-color']);
      applySectionCustomClass(section, meta['sec-custom-styles'] ?? meta['custom-class']);
      applySectionTextAlignment(section, meta['sec-alignment'] ?? meta['text-alignment']);
    } else {
      // Apply custom class for sections with data-sec-custom-styles set directly (no section-metadata block)
      applySectionCustomClass(section, section.dataset.secCustomStyles);
    }
    applySectionItemWidths(section);
  });
}

/**
 * Applies section text color from UE field (hex). Sets --section-text-color and class section--custom-text-color.
 * @param {Element} section The section element
 * @param {string} colorValue Hex color (e.g. #fff or fff)
 */
/**
 * Applies custom class(es) to section from UE field (same as hero Custom Styles). Space-separated for multiple.
 * @param {Element} section The section element
 * @param {string} value Class name(s), space-separated
 */
function applySectionCustomClass(section, value) {
  const prev = (section.dataset.secCustomStyles ?? '').trim();
  if (prev) {
    prev.split(/[\s,]+/).filter(Boolean).forEach((c) => section.classList.remove(c));
  }
  delete section.dataset.secCustomStyles;
  const next = (value ?? '').toString().trim();
  if (next) {
    section.dataset.secCustomStyles = next;
    next.split(/[\s,]+/).filter(Boolean).forEach((c) => section.classList.add(c));
  }
}

/**
 * Applies custom class(es) to a block from UE/config. Space-separated for multiple.
 * @param {Element} block The block element
 * @param {string} value Class name(s), space-separated
 */
function applyBlockCustomClass(block, value) {
  const prev = (block.dataset.blockCustomClass ?? '').trim();
  if (prev) {
    prev.split(/\s+/).filter(Boolean).forEach((c) => block.classList.remove(c));
  }
  delete block.dataset.blockCustomClass;
  const next = (value ?? '').toString().trim();
  if (next) {
    block.dataset.blockCustomClass = next;
    next.split(/\s+/).filter(Boolean).forEach((c) => block.classList.add(c));
  }
}

function applySectionTextColor(section, colorValue) {
  const normalizeColor = (s) => {
    const t = String(s ?? '').trim();
    if (!t) return '';
    const hashMatch = t.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (hashMatch) return `#${hashMatch[1]}`;
    return t;
  };
  const isHexColor = (s) => {
    const t = normalizeColor(s);
    if (!t) return false;
    if (t.startsWith('#')) return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(t);
    return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t);
  };
  const toHex = (s) => {
    const t = normalizeColor(s);
    if (t.startsWith('#')) return t;
    return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t) ? `#${t}` : t;
  };
  const raw = normalizeColor(colorValue ?? section.dataset.secColor ?? section.dataset.sectionTextColor ?? '');
  section.classList.remove('section--custom-text-color');
  section.style.removeProperty('--section-text-color');
  if (raw && isHexColor(raw)) {
    section.style.setProperty('--section-text-color', toHex(raw));
    section.classList.add('section--custom-text-color');
    section.dataset.secColor = raw;
  } else {
    delete section.dataset.secColor;
  }
}

function applySectionTextAlignment(section, alignmentValue) {
  const value = (alignmentValue ?? section.dataset.secAlignment ?? '').toString().trim().toLowerCase();
  if (['left', 'center', 'right'].includes(value)) {
    section.dataset.secAlignment = value;
  } else {
    delete section.dataset.secAlignment;
    section.removeAttribute('data-sec-alignment');
  }
}

/**
 * Applies horizontal layout and percentage widths to section items when sec-item-widths is set.
 * When section has multiple direct children (e.g. default-content-wrapper + sign-in-wrapper),
 * applies flex to the section and widths to those children so image and block sit side by side (e.g. 40,60).
 * Otherwise applies to immediate children of .default-content-wrapper.
 * @param {Element} section The section element
 */
function applySectionItemWidths(section) {
  const raw = (section.dataset?.secItemWidths
    || section.getAttribute('data-sec-item-widths')
    || '').trim();
  const isSectionBg = (el) => el.tagName === 'PICTURE' && el.classList?.contains('section-bg');
  let sectionChildren = [...section.children].filter((el) =>
    !el.classList?.contains('section-metadata') && !isSectionBg(el));
  let inner = section.querySelector('.default-content-wrapper') || sectionChildren[0];
  if (!inner) return;

  const clearWidths = (el) => {
    if (!el) return;
    el.style.flex = '';
    el.style.maxWidth = '';
    el.style.boxSizing = '';
  };
  const bgPic = section.querySelector('picture.section-bg');
  if (bgPic) clearWidths(bgPic);

  const widths = raw ? raw.split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n > 0 && n <= 100) : [];
  const dcw = section.querySelector('.default-content-wrapper');
  if (widths.length > 0 && dcw && dcw.children.length > 1) {
    const otherCount = sectionChildren.length - 1;
    const totalItems = dcw.children.length + otherCount;
    if (totalItems === widths.length) {
      const newWrappers = [];
      [...dcw.children].forEach((child) => {
        const wrap = document.createElement('div');
        wrap.appendChild(child);
        newWrappers.push(wrap);
      });
      const idx = sectionChildren.indexOf(dcw);
      newWrappers.forEach((w) => section.insertBefore(w, dcw));
      dcw.remove();
      sectionChildren = [...section.children].filter((el) =>
        !el.classList?.contains('section-metadata') && !isSectionBg(el));
      inner = section.querySelector('.default-content-wrapper') || sectionChildren[0];
    }
  }

  const clearSectionFlex = () => {
    section.style.display = '';
    section.style.flexDirection = '';
    section.style.flexWrap = '';
    section.style.gap = '';
    sectionChildren.forEach(clearWidths);
  };
  const clearInnerFlex = () => {
    inner.style.display = '';
    inner.style.flexDirection = '';
    inner.style.flexWrap = '';
    inner.style.gap = '';
    [...inner.querySelectorAll(':scope > *')].forEach(clearWidths);
    inner.querySelectorAll('[style*="flex:"], [style*="max-width"]').forEach(clearWidths);
  };
  if (!raw) {
    section.classList.remove('section-horizontal-widths');
    clearSectionFlex();
    clearInnerFlex();
    return;
  }
  if (widths.length === 0) return;
  const immediateChildren = [...inner.querySelectorAll(':scope > *')];
  const useSectionLevel = sectionChildren.length >= widths.length && sectionChildren.length > 1;
  if (useSectionLevel) {
    clearInnerFlex();
    section.classList.add('section-horizontal-widths');
    section.style.display = 'flex';
    section.style.flexDirection = 'row';
    section.style.flexWrap = 'nowrap';
    section.style.gap = '24px';
    sectionChildren.forEach((el, i) => {
      if (widths[i] != null) {
        el.style.flex = `0 0 ${widths[i]}%`;
        el.style.maxWidth = `${widths[i]}%`;
        el.style.boxSizing = 'border-box';
      } else {
        clearWidths(el);
      }
    });
  } else {
    clearSectionFlex();
    const set = new Set(immediateChildren);
    inner.querySelectorAll('[style*="flex:"], [style*="max-width"]').forEach((el) => {
      if (!set.has(el)) clearWidths(el);
    });
    section.classList.add('section-horizontal-widths');
    inner.style.display = 'flex';
    inner.style.flexDirection = 'row';
    inner.style.flexWrap = 'nowrap';
    inner.style.gap = '24px';
    immediateChildren.forEach((el, i) => {
      if (widths[i] != null) {
        el.style.flex = `0 0 ${widths[i]}%`;
        el.style.maxWidth = `${widths[i]}%`;
        el.style.boxSizing = 'border-box';
      } else {
        clearWidths(el);
      }
    });
  }
}

function applySectionBackgroundImage(section, bgImagePath) {
  const existing = section.querySelector('picture.section-bg');
  if (existing) existing.remove();
  section.classList.remove('section-has-bg');
  const path = (bgImagePath ?? section.dataset.secBgImage ?? '').toString().trim();
  if (path) {
    section.dataset.secBgImage = path;
    const picture = createOptimizedPicture(path, '', false, [{ width: '2000' }]);
    picture.classList.add('section-bg');
    const img = picture.querySelector('img');
    if (img) img.classList.add('sec-img');
    section.classList.add('section-has-bg');
    section.prepend(picture);
  } else {
    delete section.dataset.secBgImage;
  }
}

function setupSectionItemWidthsUE() {
  const handler = (event) => {
    const resource = event.detail?.request?.target?.resource;
    const section = document.querySelector(`.section[data-aue-resource="${resource}"]`);
    if (!section) return;
    if (event.type === 'aue:content-details') {
      const content = event.detail?.content || {};
      const val = content['sec-item-widths'] ?? content.secItemWidths ?? '';
      if (val !== '') {
        section.dataset.secItemWidths = String(val);
        applySectionItemWidths(section);
      }
      const bgVal = content['sec-bg-image'] ?? content.secBgImage ?? content.image ?? '';
      applySectionBackgroundImage(section, bgVal);
      const colorVal = content['sec-color'] ?? content.secColor ?? content['section-text-color'] ?? content.sectionTextColor ?? '';
      applySectionTextColor(section, colorVal);
      const customClassVal = content['sec-custom-styles'] ?? content.secCustomStyles ?? content['custom-class'] ?? content.customClass ?? '';
      applySectionCustomClass(section, customClassVal);
      const alignmentVal = content['sec-alignment'] ?? content.secAlignment ?? content['text-alignment'] ?? content.textAlignment ?? '';
      applySectionTextAlignment(section, alignmentVal);
    }
    if (event.type === 'aue:content-patch') {
      const patch = event.detail?.patch;
      if (patch?.name === 'sec-item-widths') {
        section.dataset.secItemWidths = String(patch.value || '');
        applySectionItemWidths(section);
      }
      if (patch?.name === 'sec-bg-image' || patch?.name === 'image') {
        applySectionBackgroundImage(section, patch.value ?? '');
      }
      if (patch?.name === 'sec-color' || patch?.name === 'section-text-color') {
        applySectionTextColor(section, patch.value ?? '');
      }
      if (patch?.name === 'sec-custom-styles') {
        applySectionCustomClass(section, patch.value ?? '');
      }
      if (patch?.name === 'sec-alignment') {
        applySectionTextAlignment(section, patch.value ?? '');
      }
    }
  };
  document.body.addEventListener('aue:content-details', handler);
  document.body.addEventListener('aue:content-patch', handler);
}

function setupBlockCustomClassUE() {
  const handler = (event) => {
    const resource = event.detail?.request?.target?.resource;
    const block = resource
      ? document.querySelector(`.block[data-aue-resource="${resource}"]`)
      : null;
    if (!block) return;
    if (event.type === 'aue:content-details') {
      const content = event.detail?.content || {};
      const customClassVal = content['custom-class'] ?? content.customClass ?? '';
      applyBlockCustomClass(block, customClassVal);
    }
    if (event.type === 'aue:content-patch') {
      const patch = event.detail?.patch;
      if (patch?.name === 'custom-class' || patch?.name === 'customClass') {
        applyBlockCustomClass(block, patch.value ?? '');
      }
    }
  };
  document.body.addEventListener('aue:content-details', handler);
  document.body.addEventListener('aue:content-patch', handler);
}

/**
 * Gets placeholders object.
 * @param {string} [prefix] Location of placeholders
 * @returns {object} Window placeholders object
 */
async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) {
            // Clone the response before reading
            return resp.clone().json();
          }
          return {};
        })
        .then((json) => {
          const placeholders = {};
          json.data
            ?.filter((placeholder) => placeholder.Key)
            .forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });
          window.placeholders[prefix] = placeholders;
          resolve(window.placeholders[prefix]);
        })
        .catch((error) => {
          console.error('Error loading placeholders:', error);
          window.placeholders[prefix] = {};
          resolve(window.placeholders[prefix]);
        });
    });
  }
  return window.placeholders[`${prefix}`];
}


/*
// eslint-disable-next-line import/prefer-default-export
async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return {};
        })
        .then((json) => {
          const placeholders = {};
          json.data
            .filter((placeholder) => placeholder.Key)
            .forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });
          window.placeholders[prefix] = placeholders;
          resolve(window.placeholders[prefix]);
        })
        .catch(() => {
          // error loading placeholders
          window.placeholders[prefix] = {};
          resolve(window.placeholders[prefix]);
        });
    });
  }
  return window.placeholders[`${prefix}`];
}
*/

/**
 * Builds a block DOM Element from a two dimensional array, string, or object
 * @param {string} blockName name of the block
 * @param {*} content two dimensional array or string or object of content
 */
function buildBlock(blockName, content) {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return blockEl;
}

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
async function loadBlock(block) {
  const status = block.dataset.blockStatus;
  if (status !== 'loading' && status !== 'loaded') {
    block.dataset.blockStatus = 'loading';
    const { blockName } = block.dataset;
    try {
      const cssLoaded = loadCSS(`${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`);
      const decorationComplete = new Promise((resolve) => {
        (async () => {
          try {
            const mod = await import(
              `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.js`
            );
            if (mod.default) {
              await mod.default(block);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.log(`failed to load module for ${blockName}`, error);
          }
          resolve();
        })();
      });
      await Promise.all([cssLoaded, decorationComplete]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(`failed to load block ${blockName}`, error);
    }
    block.dataset.blockStatus = 'loaded';
  }
  return block;
}

/**
 * Decorates a block.
 * @param {Element} block The block element
 */
function decorateBlock(block) {
  const shortBlockName = block.classList[0];
  if (shortBlockName && !block.dataset.blockStatus) {
    const config = readBlockConfig(block) || {};
    const customClassVal = config['custom-class'] ?? config.customClass ?? '';
    block.classList.add('block');
    block.dataset.blockName = shortBlockName;
    block.dataset.blockStatus = 'initialized';
    applyBlockCustomClass(block, customClassVal);
    wrapTextNodes(block);
    const blockWrapper = block.parentElement;
    blockWrapper.classList.add(`${shortBlockName}-wrapper`);
    const section = block.closest('.section');
    if (section) section.classList.add(`${shortBlockName}-container`);
    // eslint-disable-next-line no-use-before-define
    decorateButtons(block);
          // Set block ID with shortBlockName and index
          const blocks = document.querySelectorAll(`.${shortBlockName}`);
          blocks.forEach((block, index) => {
            block.id = `${shortBlockName}-${index}`;
            
            // Add indexed IDs to images within the block
            const images = block.querySelectorAll('img');
            images.forEach((img, imgIndex) => {
              const imgId = `${shortBlockName}_${index}_image_${imgIndex}`;
              img.id = imgId;
            });
            // Skip content ID generation for blocks that handle it themselves (columns, cards, carousel)
            const blocksWithCustomIDs = ['columns', 'cards', 'carousel'];
            if (!blocksWithCustomIDs.includes(shortBlockName)) {
              // Merge headings (h1-h6) and paragraphs into a single loop for efficiency
              ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].forEach((tag) => {
                const elements = block.querySelectorAll(tag);
                elements.forEach((el, elIndex) => {
                  el.id = `${shortBlockName}_${index}_${tag}_${elIndex}`;
                });
              });
            }
          });
          }
          }
        
/**
 * Decorates a default block.
 * @param {Element} block The block element
 */
export function decorateDefaultBlock(main) {
  const sections = main.querySelectorAll('.section');
  sections.forEach((section, sectionIndex) => {
    // Find all default-content-wrapper elements in this section
    const defaultWrappers = section.querySelectorAll('.default-content-wrapper');
    defaultWrappers.forEach((wrapper, wrapperIndex) => {
      wrapper.setAttribute('data-section-content-index', `${sectionIndex}_${wrapperIndex}`);
      
      // Add IDs to text elements (overwrite any existing IDs)
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol'].forEach((tag) => {
        const elements = wrapper.querySelectorAll(tag);
        let adjustedIndex = 0; // Use a separate counter for adjusted indexing
        elements.forEach((el) => {
          // Check if this is a <p> tag containing only an image (picture or img element)
          if (tag === 'p') {
            const hasOnlyImage = el.querySelector('picture, img') &&
                                el.textContent.trim() === '';
            
            if (hasOnlyImage) {
              // Skip ID assignment for <p> tags that only contain images
              // The image itself will get its own ID separately
              return; // Skip this element
            }
          }
          
          el.id = `section_${sectionIndex}_content_${wrapperIndex}_${tag}_${adjustedIndex}`;
          adjustedIndex++;
        });
      });
    });
    
    // Add IDs to images at section level (overwrite any existing IDs)
    const images = section.querySelectorAll('.default-content-wrapper img');
    images.forEach((img, imgIndex) => {
      img.id = `section_${sectionIndex}_image_${imgIndex}`;
    });
  });
}
/**
 * Decorates all blocks in a container element.
 * @param {Element} main The container element
 */
function decorateBlocks(main) {
  /* Section-level blocks and blocks inside columns (so action-button etc. load and style in columns).
   * Use both .columns > div > div > div (before columns block is decorated) and .columns-row > div > div
   * (after columns adds .columns-row) so column blocks are found regardless of load order. */
  main.querySelectorAll('div.section > div > div, .columns > div > div > div, .columns-row > div > div').forEach(decorateBlock);
}

/**
 * Loads a block named 'header' into header
 * @param {Element} header header element
 * @returns {Promise}
 */
async function loadHeader(header) {
  const headerBlock = buildBlock('header', '');
  header.append(headerBlock);
  decorateBlock(headerBlock);
  return loadBlock(headerBlock);
}

/**
 * Loads a block named 'footer' into footer
 * @param footer footer element
 * @returns {Promise}
 */
async function loadFooter(footer) {
  const footerBlock = buildBlock('footer', '');
  footer.append(footerBlock);
  decorateBlock(footerBlock);
  return loadBlock(footerBlock);
}

/**
 * Wait for Image.
 * @param {Element} section section element
 */
async function waitForFirstImage(section) {
  const lcpCandidate = section.querySelector('img');
  await new Promise((resolve) => {
    if (lcpCandidate && !lcpCandidate.complete) {
      lcpCandidate.setAttribute('loading', 'eager');
      lcpCandidate.setAttribute('fetchpriority', 'high');
      lcpCandidate.addEventListener('load', resolve);
      lcpCandidate.addEventListener('error', resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Loads all blocks in a section.
 * @param {Element} section The section element
 */

async function loadSection(section, loadCallback) {
  const status = section.dataset.sectionStatus;
  if (!status || status === 'initialized') {
    section.dataset.sectionStatus = 'loading';
    const blocks = [...section.querySelectorAll('div.block')];
    for (let i = 0; i < blocks.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await loadBlock(blocks[i]);
    }
    if (loadCallback) await loadCallback(section);
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
  }
}

/**
 * Updates all section status in a container element.
 * @param {Element} main The container element
 */
function updateSectionsStatus(main) {
  const sections = [...main.querySelectorAll(':scope > div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const status = section.dataset.sectionStatus;
    if (status !== 'loaded') {
      const loadingBlock = section.querySelector(
        '.block[data-block-status="initialized"], .block[data-block-status="loading"]',
      );
      if (loadingBlock) {
        section.dataset.sectionStatus = 'loading';
        break;
      } else {
        section.dataset.sectionStatus = 'loaded';
        section.style.display = null;
      }
    }
  }
}

/**
 * Loads JS and CSS for all blocks in a container element.
 * @param {Element} main The container element
 */
async function loadBlocks(main) {
  updateSectionsStatus(main);
  const blocks = [...main.querySelectorAll('div.block')];
  for (let i = 0; i < blocks.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadBlock(blocks[i]);
    updateSectionsStatus(main);
  }
}

/**
 * Loads all sections.
 * @param {Element} element The parent element of sections to load
 */

async function loadSections(element) {
  const sections = [...element.querySelectorAll('div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadSection(sections[i]);
    if (i === 0 && sampleRUM.enhance) {
      sampleRUM.enhance();
    }
  }
}

init();

export {
  applySectionItemWidths,
  buildBlock,
  createLumaProductImagePicture,
  createOptimizedPicture,
  createResponsiveAemDamPicture,
  decorateBlock,
  decorateBlocks,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateTemplateAndTheme,
  fetchPlaceholders,
  getMetadata,
  loadBlock,
  loadBlocks,
  loadCSS,
  loadFooter,
  loadHeader,
  loadScript,
  loadSection,
  loadSections,
  updateSectionsStatus,
  readBlockConfig,
  sampleRUM,
  setup,
  toCamelCase,
  toClassName,
  waitForFirstImage,
  wrapTextNodes,
  hideSidekick
};
