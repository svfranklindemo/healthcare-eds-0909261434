/*
import { patternDecorate } from '../../scripts/blockTemplate.js';

export default async function decorate(block) {
  patternDecorate(block);
}
*/

import { createOptimizedPicture, toClassName } from '../../scripts/aem.js';
import { moveInstrumentation, normalizeAemPath } from '../../scripts/scripts.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

export default function decorate(block) {
  const fireButtonCustomEventIfConfigured = (buttonLink) => {
    const eventType = buttonLink?.dataset?.buttonEventType?.trim();
    if (eventType) dispatchCustomEvent(eventType);
  };

  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');

    const getConfigValue = (propName, fallbackIndex) => {
      const propEl = row.querySelector(`p[data-aue-prop="${propName}"]`) || row.querySelector(`[data-aue-prop="${propName}"]`);
      if (propEl?.textContent?.trim()) return propEl.textContent.trim();
      return row.children[fallbackIndex]?.querySelector?.('p')?.textContent?.trim()
        || row.children[fallbackIndex]?.textContent?.trim()
        || '';
    };

    const normalizeCtaStyle = (value) => {
      const styleMap = {
        button: 'cta-button',
        'button-secondary': 'cta-button-secondary',
        'button-dark': 'cta-button-dark',
        link: 'cta-link',
        default: 'default',
        'cta-button': 'cta-button',
        'cta-button-secondary': 'cta-button-secondary',
        'cta-button-dark': 'cta-button-dark',
        'cta-link': 'cta-link',
        'cta-default': 'default',
      };
      return styleMap[(value || '').trim()] || (value || '').trim() || 'default';
    };
    
    // Read card style from the third div (index 2)
    const cardStyle = getConfigValue('style', 2) || 'default';
    if (cardStyle && cardStyle !== 'default') {
      li.className = cardStyle;
    }

    // Read CTA style by prop when author metadata exists, or by the known config column on publish.
    const ctaStyle = normalizeCtaStyle(getConfigValue('ctastyle', 4));
    
    // Read image style by prop when author metadata exists, or by the known config column on publish.
    const imageStyle = getConfigValue('imagestyle', 3) || '';

    const getCell = (idx) => (row.children[idx]?.querySelector?.('p')?.textContent?.trim()
      || row.children[idx]?.textContent?.trim() || '').toString();

    const getConfigCells = () => [...row.children]
      .slice(2)
      .map((child) => child.querySelector?.('p')?.textContent?.trim() || child.textContent?.trim() || '');

    const publishConfigCells = getConfigCells();
    const lastConfigValue = publishConfigCells[publishConfigCells.length - 1] || '';
    const prevConfigValue = publishConfigCells[publishConfigCells.length - 2] || '';
    const lastConfigIsBoolean = /^(true|false)$/i.test(lastConfigValue);
    /** True if string looks like a hex color (#xxx, #xxxxxx, or 3/6 hex chars). */
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

    // Background color: model field at index 8 (after alignment at 7).
    // Also checked via data-aue-prop on author, and via hex-link/hex-cell fallbacks.
    let bgColorRaw = getConfigValue('backgroundcolor', 8);
    if (!bgColorRaw) {
      bgColorRaw = (row.querySelector('p[data-aue-prop="backgroundcolor"]')
        || row.querySelector('[data-aue-prop="backgroundcolor"]'))?.textContent?.trim() || '';
    }
    if (!bgColorRaw) {
      const hexLink = row.querySelector('a[href^="#"]');
      if (hexLink && isHexColor(hexLink.getAttribute('href') || '')) bgColorRaw = (hexLink.getAttribute('href') || '').replace(/^#/, '');
      if (!bgColorRaw && isHexColor(getCell(8))) bgColorRaw = getCell(8).trim();
      if (!bgColorRaw && isHexColor(getCell(5))) bgColorRaw = getCell(5).trim().replace(/^#/, '');
    }
    if (bgColorRaw) {
      li.style.backgroundColor = toHex(bgColorRaw);
      li.classList.add('cards-card--custom-bg');
    }

    let textColorRaw = getConfigValue('textcolor', 12);
    if (!textColorRaw) {
      textColorRaw = (row.querySelector('p[data-aue-prop="textcolor"]')
        || row.querySelector('[data-aue-prop="textcolor"]'))?.textContent?.trim() || '';
    }
    if (textColorRaw && isHexColor(textColorRaw)) {
      li.style.setProperty('--cards-text-color', toHex(textColorRaw));
      li.classList.add('cards-card--custom-text-color');
    }

    const link = getCell(5);
    const selectable = getCell(6);
    const alignment = (getCell(7) || 'left').toLowerCase();
    const buttonEventType = getConfigValue('buttoneventtype', 9);
    // Read custom styles by data-aue-prop so it works regardless of column order (UE authoring)
    // customStyles is at index 10 (backgroundcolor occupies index 9)
    let customStylesRaw = getConfigValue('customstyles', 10) || getCell(10) || '';
    if (!customStylesRaw) {
      customStylesRaw = lastConfigIsBoolean ? prevConfigValue : lastConfigValue;
    }

    const overlayBackgroundValue = getConfigValue('overlaybackground', 11)
      || (lastConfigIsBoolean ? lastConfigValue : '');

    if (customStylesRaw) {
      customStylesRaw.split(/[\s,]+/).forEach((part) => {
        const cls = toClassName(part.trim());
        if (cls) li.classList.add(cls);
      });
    }

    if (((overlayBackgroundValue || 'true').toLowerCase() === 'false')) {
      li.classList.add('cards-card--overlay-background-off');
    }

    li.classList.add(`cards-card--alignment-${alignment}`);
    if (selectable.toLowerCase() === 'true') li.classList.add('cards-card--selectable');
    if (link && !isHexColor(link)) {
      li.dataset.sectionLink = link;
      li.addEventListener('click', () => {
        // leave true external links (not pointing at /content/) untouched
        if (/^https?:\/\//i.test(link)) {
          try {
            if (!new URL(link).pathname.startsWith('/content/')) {
              window.location.href = link;
              return;
            }
          } catch {
            window.location.href = link;
            return;
          }
        }
        window.location.href = normalizeAemPath(link);
      });
    }


    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    
    // Process the li children to identify and style them correctly
    let imageContainerDiv = null;
    [...li.children].forEach((div, index) => {
      // First div (index 0) - Image
      if (index === 0) {
        div.className = 'cards-card-image';
        imageContainerDiv = div; // Store reference for later
      }
      // Second div (index 1) - Content with button
      else if (index === 1) {
        div.className = 'cards-card-body';
      }
      // All other divs (config, or any extra from UE) - hidden so only image + body show in layout
      else if (index >= 2) {
        div.className = 'cards-config';
        const p = div.querySelector('p');
        if (p) p.style.display = 'none';
      }
    });
    
    // First, remove compact-style from ALL elements to prevent it from being on wrong elements
    li.querySelectorAll('*').forEach(el => {
      if (el.classList.contains('compact-style')) {
        el.classList.remove('compact-style');
      }
    });
    
    // Apply image style ONLY to the image container (Cover = default, no class needed)
    const imageStyleClass = (imageStyle || '').trim().toLowerCase();
    if (imageContainerDiv && imageStyleClass && imageStyleClass !== 'default') {
      imageContainerDiv.classList.add(imageStyleClass);
    }
    
    // Apply CTA styles to button containers
    const buttonContainers = li.querySelectorAll('p.button-container');
    buttonContainers.forEach(buttonContainer => {
      // Remove any existing CTA classes and ensure compact-style is NOT on button containers
      buttonContainer.classList.remove('default', 'cta-button', 'cta-button-secondary', 'cta-button-dark', 'cta-default', 'compact-style');
      // Add the correct CTA class
      buttonContainer.classList.add(ctaStyle);
    });

    const ctaLink = li.querySelector('p.button-container a, .button-container a');
    if (ctaLink) {
      if (ctaLink.dataset.buttonEventType && isHexColor(ctaLink.dataset.buttonEventType)) delete ctaLink.dataset.buttonEventType;
      if (buttonEventType && !isHexColor(buttonEventType)) ctaLink.dataset.buttonEventType = buttonEventType;

      ctaLink.addEventListener('click', () => {
        fireButtonCustomEventIfConfigured(ctaLink);
      });
    }

    // Final cleanup: ensure compact-style is ONLY on the image container
    if (imageStyle && imageStyle === 'compact-style') {
      li.querySelectorAll('*').forEach(el => {
        if (el !== imageContainerDiv && el.classList.contains('compact-style')) {
          el.classList.remove('compact-style');
        }
      });
      // Re-apply to image container if it was removed
      if (imageContainerDiv && !imageContainerDiv.classList.contains('compact-style')) {
        imageContainerDiv.classList.add('compact-style');
      }
    }
    
    ul.append(li);
  });
  const cardPictureBreakpoints = document.body.classList.contains('luma-theme')
    ? [
      { media: '(min-width: 600px)', width: '600' },
      { width: '400' },
    ]
    : [{ width: '750' }];

  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, cardPictureBreakpoints);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  
  // Final cleanup after image optimization: ensure compact-style is only on image containers
  ul.querySelectorAll('li').forEach((li) => {
    const imageContainer = li.querySelector('.cards-card-image');
    const buttonContainers = li.querySelectorAll('p.button-container');
    
    // Remove compact-style from button containers
    buttonContainers.forEach(buttonContainer => {
      if (buttonContainer.classList.contains('compact-style')) {
        buttonContainer.classList.remove('compact-style');
      }
    });
    
    // Ensure compact-style is on image container if it should be
    // Check if there's an image style config div with compact-style
    const imageStyleConfig = Array.from(li.querySelectorAll('.cards-config')).find(div => {
      const p = div.querySelector('p[data-aue-prop="imagestyle"]');
      return p && p.textContent.trim() === 'compact-style';
    });
    
    if (imageStyleConfig && imageContainer) {
      imageContainer.classList.add('compact-style');
    }
  });
 
  block.textContent = '';
  block.append(ul);

  const blocks = document.querySelectorAll(`.cards`);
  blocks.forEach((block, index) => {
    block.id = `cards-${index}`;
    
    // Add indexed IDs to images within the block
    const images = block.querySelectorAll('img');
    images.forEach((img, imgIndex) => {
      const imgId = `cards_${index}_image_${imgIndex}`;
      img.id = imgId;
    });

    // Add indexed IDs to text content divs only
    const cardBodies = block.querySelectorAll('.cards-card-body');
    cardBodies.forEach((cardBody, bodyIndex) => {
      cardBody.setAttribute('data-text-block-index', bodyIndex);
    });

    // Add indexed IDs to heading elements with container context
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6','p'].forEach((tag) => {
      const elements = block.querySelectorAll(tag);
      elements.forEach((el) => {
        const textBlock = el.closest('[data-text-block-index]');
        const textBlockIndex = textBlock ? textBlock.getAttribute('data-text-block-index') : 'unknown';
        
        // Count this tag within its text block
        const textBlockElements = textBlock ? textBlock.querySelectorAll(tag) : [el];
        const tagIndex = Array.from(textBlockElements).indexOf(el);
        
        el.id = `cards_${index}_text_${textBlockIndex}_${tag}_${tagIndex}`;
      });
    });
  });

}
