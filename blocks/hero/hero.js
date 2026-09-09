import { getMetadata, resolveAnchorValue } from '../../scripts/aem.js';
import { moveInstrumentation, normalizeAemPath } from '../../scripts/scripts.js';
import { readBlockConfig } from '../../scripts/aem.js';

/**
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  const HORIZONTAL_ALIGNMENT_VALUES = ['left', 'center', 'right'];
  const VERTICAL_ALIGNMENT_VALUES = ['top', 'middle', 'bottom'];

  /* Value from nth row (same approach as lines 39–46): row = :scope > div:nth-child(n), value from first cell */
  const rowVal = (n) => {
    const row = block.querySelector(`:scope > div:nth-child(${n})`);
    if (!row?.children?.length) return undefined;
    const col = row.children[1] ?? row.children[0];
    if (col?.querySelector?.('a')) {
      const as = [...col.querySelectorAll('a')];
      return as.length === 1 ? resolveAnchorValue(as[0]) : as.map(resolveAnchorValue);
    }
    return col?.textContent?.trim();
  };

  const pickFirstMatchingValue = (values, allowedValues) => values
    .map((value) => (value ?? '').toString().trim().toLowerCase())
    .find((value) => allowedValues.includes(value));

  const enableUnderline = (config.enableunderline ?? rowVal(3) ?? 'true').toString();
  const layoutStyle = config.herolayout ?? rowVal(4) ?? 'overlay';
  const ctaStyle = config.ctastyle ?? rowVal(5) ?? 'default';
  const backgroundStyle = config.backgroundstyle ?? rowVal(6) ?? 'default';
  const textOverlayValue = (config.textoverlay ?? block.querySelector('[data-aue-prop="textoverlay"]')?.textContent?.trim() ?? rowVal(16) ?? 'false').toString().toLowerCase();
  const textOverlayEnabled = textOverlayValue === 'true';
  const backgroundColor = (config.backgroundcolor ?? block.querySelector('[data-aue-prop="backgroundcolor"]')?.textContent?.trim() ?? '').toString().trim();
  if (backgroundColor) {
    const hex = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(backgroundColor) ? `#${backgroundColor}` : backgroundColor;
    block.style.backgroundColor = hex;
  }

  if (layoutStyle) {
    block.classList.add(`${layoutStyle}`);
  }

  if (backgroundStyle) {
    block.classList.add(`${backgroundStyle}`);
  }

  if (!textOverlayEnabled) {
    block.classList.add('hero--text-overlay-off');
  }

  if (enableUnderline.toLowerCase() === 'false') {
    block.classList.add('removeunderline');
  }

  const buttonContainer = block.querySelector('p.button-container');
  if (buttonContainer) {
    buttonContainer.classList.add(`cta-${ctaStyle || 'default'}`);
  }

  const ctaStyleParagraph = block.querySelector('p[data-aue-prop="ctastyle"]');
  if (ctaStyleParagraph) {
    ctaStyleParagraph.style.display = 'none';
  }

  const underlineDiv = block.querySelector(':scope > div:nth-child(3)');
  if (underlineDiv) underlineDiv.style.display = 'none';
  const layoutStyleDiv = block.querySelector(':scope > div:nth-child(4)');
  if (layoutStyleDiv) layoutStyleDiv.style.display = 'none';
  const ctaStyleDiv = block.querySelector(':scope > div:nth-child(5)');
  if (ctaStyleDiv) ctaStyleDiv.style.display = 'none';
  const backgroundStyleDiv = block.querySelector(':scope > div:nth-child(6)');
  if (backgroundStyleDiv) backgroundStyleDiv.style.display = 'none';

  /* Hide remaining config rows (alignment, verticalalignment, isfullwidth, height, color, link, button actions) on live */
  [...block.children].forEach((row, index) => {
    if (index >= 6) row.style.display = 'none';
  });

  /* Banner-like: alignment, vertical alignment, full width – from config, data-aue-prop, or row DOM */
  const alignment = pickFirstMatchingValue([
    config.alignment,
    block.querySelector('[data-aue-prop="alignment"]')?.textContent?.trim(),
    rowVal(7),
    rowVal(8),
  ], HORIZONTAL_ALIGNMENT_VALUES) ?? 'center';
  if (alignment) block.classList.add(`hero--alignment-${alignment}`);

  const verticalAlignment = pickFirstMatchingValue([
    config.verticalalignment,
    block.querySelector('[data-aue-prop="verticalalignment"]')?.textContent?.trim(),
    rowVal(8),
    rowVal(9),
  ], VERTICAL_ALIGNMENT_VALUES) ?? 'middle';
  block.classList.add(`hero--verticalalignment-${verticalAlignment}`);

  const isFullWidth = config.isfullwidth === 'true' || config.isfullwidth === true || rowVal(9) === 'true';
  if (isFullWidth) {
    block.classList.add('hero--fullwidth');
  }

  /* Height: read from data-aue-prop first so UE value is used regardless of row order */
  let heightVal = (config.height ?? block.querySelector('[data-aue-prop="height"]')?.textContent?.trim() ?? rowVal(10) ?? rowVal(11))?.toString?.()?.trim();
  if (heightVal === 'false' || heightVal === 'true') {
    heightVal = rowVal(11)?.toString?.()?.trim();
  }
  if (heightVal) {
    if (/^\d+$/.test(heightVal)) heightVal = `${heightVal}px`;
    block.style.minHeight = heightVal;
  }

  /* Helpers: detect hex color so we don't use it as section link or other fields */
  const isHexColor = (s) => {
    const t = String(s).trim();
    if (!t) return false;
    if (t.startsWith('#')) return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(t);
    return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t);
  };
  const toHex = (s) => {
    const t = String(s).trim();
    if (t.startsWith('#')) return t;
    return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(t) ? `#${t}` : t;
  };

  /* Text color: from data-aue-prop, or from a[href="#..."] (UE often stores color in link field), or row */
  let textColorRaw = (config.color ?? block.querySelector('[data-aue-prop="color"]')?.textContent?.trim() ?? rowVal(11))?.toString?.().trim() ?? '';
  if (!textColorRaw) {
    const hexLink = block.querySelector('a[href^="#"]');
    const href = hexLink?.getAttribute('href')?.trim() || '';
    if (href && isHexColor(href)) textColorRaw = href.replace(/^#/, '');
  }
  if (textColorRaw && isHexColor(textColorRaw)) {
    block.style.setProperty('--hero-text-color', toHex(textColorRaw));
    block.classList.add('hero--custom-text-color');
  }

  /* Section link: do not use when value is a hex color (UE may put Text Color in Link field) */
  const sectionLinkRaw = (config.link ?? rowVal(13)) && String(config.link ?? rowVal(13)).trim();
  if (sectionLinkRaw && isHexColor(sectionLinkRaw)) {
    delete block.dataset.sectionLink;
  } else if (sectionLinkRaw) {
    block.dataset.sectionLink = sectionLinkRaw;
    block.addEventListener('click', () => {
      // leave true external links (not pointing at /content/) untouched
      if (/^https?:\/\//i.test(sectionLinkRaw)) {
        try {
          if (!new URL(sectionLinkRaw).pathname.startsWith('/content/')) {
            window.location.href = sectionLinkRaw;
            return;
          }
        } catch {
          window.location.href = sectionLinkRaw;
          return;
        }
      }
      window.location.href = normalizeAemPath(sectionLinkRaw);
    });
  }

  const ctaLink = block.querySelector('p.button-container a, .button-container a');
  if (ctaLink) {
    const eventType = config.buttoneventtype ?? rowVal(14);
    if (eventType && String(eventType).trim()) ctaLink.dataset.buttonEventType = String(eventType).trim();
  }

}