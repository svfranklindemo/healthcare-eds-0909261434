import { readBlockConfig } from '../../scripts/aem.js';
import { parseRSS, updateLocalStorage } from '../../scripts/utils.js';

export default async function decorate(block) {
  const cfg = readBlockConfig(block) || {};
  const maxDisplay = Number(cfg.maxcardsdisplayed) || 6;
  const cardsPerRow = cfg['cards-per-row'] || '3';
  const categoryFilter = cfg['category-filter'] ? `/${cfg['category-filter']}/rss` : '/world/rss';
  const detailPageUrl = cfg['detail-page-url'] || '/en/article';
  const showDesc = String(cfg.showdescription).toLowerCase() === 'true';

  block.innerHTML = '<div class="rss-list-loading">Loading news...</div>';

  try {
    const response = await fetch(`https://www.theguardian.com${categoryFilter}`);
    if (!response.ok) throw new Error('RSS fetch failed');
    const xmlText = await response.text();

    const freshItems = parseRSS(xmlText);
    let items = updateLocalStorage(freshItems);

    items = items.slice(0, maxDisplay);

    block.innerHTML = ''; 
    const grid = document.createElement('div');
    grid.className = 'rss-list-grid';
    grid.style.setProperty('--rss-columns', cardsPerRow);

    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'rss-card';

      if (!item.image) {
        card.style.display = 'none';
        grid.appendChild(card);
        return;
      }

      const targetUrl = `${detailPageUrl}?id=${item.id}`;
      card.addEventListener('click', () => { window.location.href = targetUrl; });

      const dateText = item.pubDate ? new Date(item.pubDate).toLocaleString() : '';

      card.innerHTML = `
        <div class="rss-card-media"><img src="${item.image}" alt="${item.title}" loading="lazy"></div>
        <div class="rss-card-meta">
          ${dateText ? `<p class="rss-card-date">${dateText}</p>` : ''}
          <h3 class="rss-card-title">${item.title}</h3>
          ${showDesc && item.description ? `<div class="rss-card-desc"><p>${item.description}</p></div>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });

    block.appendChild(grid);
  } catch (error) {
    block.innerHTML = `<p class="rss-list-empty">Failed to load news feed.</p>`;
    console.error('RSS Block Error:', error);
  }
}