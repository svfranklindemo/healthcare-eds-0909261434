import { div, a, span } from '../../scripts/dom-helpers.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { resolveAnchorValue } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

function getTextFromSelector(block, selector) {
  const el = block.querySelector(selector);
  if (!el) return '';
  const text = (el.textContent || '').trim();
  return text;
}

export default function decorate(block) {
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

  const normalizeRowValue = (value) => {
    if (Array.isArray(value)) return value.length ? value[0] : '';
    return value ?? '';
  };

  const appendHtmlIfAuthor = (value) => {
    if (!value) return value;
    if (!isAuthorEnvironment()) return value;
    if (/^https?:\/\//i.test(value)) {
      try {
        if (!new URL(value).pathname.startsWith('/content/')) return value; // external link — leave untouched
      } catch {
        return value;
      }
    }
    // insert .html before any query string/hash instead of appending to the very end
    const [pathname, suffix = ''] = value.match(/^([^?#]*)([?#].*)?$/).slice(1);
    return pathname.toLowerCase().endsWith('.html') ? value : `${pathname}.html${suffix}`;
  };

  const rowLinkElement = block.querySelector(':scope > div:nth-child(1) a') || block.querySelector('a[href]');
  const rowLinkUrl = rowLinkElement ? appendHtmlIfAuthor(resolveAnchorValue(rowLinkElement)) : '';
  const rowLabel = normalizeRowValue(rowVal(2));
  const rowTitle = normalizeRowValue(rowVal(3));
  const rowStyle = normalizeRowValue(rowVal(4));
  const rowAlignment = normalizeRowValue(rowVal(5));
  const rowButtonEventType = normalizeRowValue(rowVal(6));

  const buttonLink = rowLinkUrl || '#';

  const buttonLabel = getTextFromSelector(block, '[data-aue-prop="label"]')
    || getTextFromSelector(block, '[data-aue-prop="title"]')
    || rowLabel
    || getTextFromSelector(block, 'p')
    || 'Button';

  const buttonTitle = getTextFromSelector(block, '[data-aue-prop="title"]') || rowTitle || '';

  const buttonStyle = (getTextFromSelector(block, '[data-aue-prop="style"]') || rowStyle || 'default-button').trim()
    || 'default-button';
  const alignment = (getTextFromSelector(block, '[data-aue-prop="alignment"]') || rowAlignment || 'left').trim().toLowerCase();
  const buttonEventType = (
    getTextFromSelector(block, '[data-aue-prop="buttoneventtype"]')
    || getTextFromSelector(block, '[data-aue-prop="eventType"]')
    || rowButtonEventType
    || ''
  ).trim();

  const safeAlignment = ['left', 'center', 'right'].includes(alignment) ? alignment : 'left';

  const buttonElement = div({ class: `button-container ${buttonStyle} align-${safeAlignment}` },
    a({
      href: buttonLink,
      class: 'button',
      title: buttonTitle || buttonLabel
    },
      span({ class: 'button-text' }, buttonLabel)
    )
  );

  if (buttonEventType) {
    buttonElement.querySelector('a.button')?.setAttribute('data-button-event-type', buttonEventType);
    buttonElement.querySelector('a.button')?.addEventListener('click', () => {
      dispatchCustomEvent(buttonEventType);
    });
  }

  /* Replace all block content with the single button so AUE metadata never shows (author + live) */
  block.replaceChildren(buttonElement);
}