import { createOptimizedPicture, readBlockConfig } from '../../scripts/aem.js';
import { div } from '../../scripts/dom-helpers.js';
import { parseRSS } from '../../scripts/utils.js';

export default async function decorate(block) {
  const cfg = readBlockConfig(block) || {};
  
  const urlParams = new URLSearchParams(window.location.search);
  const articleId = urlParams.get('id');

  if (!articleId) {
    block.innerHTML = '<p class="rss-detail-error">No article selected.</p>';
    return;
  }

  block.innerHTML = '<p class="rss-detail-loading">Loading article...</p>';
  let article = null;

  const cachedData = localStorage.getItem('rss_feed_cache');
  if (cachedData) {
    const items = JSON.parse(cachedData);
    article = items.find(item => item.id === articleId);
  }

  if (!article) {
    try {
      const response = await fetch('https://www.theguardian.com/uk/business/rss');
      if (response.ok) {
        const xmlText = await response.text();
        const freshItems = parseRSS(xmlText);
        article = freshItems.find(item => item.id === articleId);
      }
    } catch (e) {
      console.error('Fallback fetch failed', e);
    }
  }

  block.innerHTML = '';

  if (article) {
    const dateText = article.pubDate ? new Date(article.pubDate).toLocaleString() : '';
    let promoBanner = null;
    if (cfg['rss-promo-banner']) {
      const bannerPicture = createOptimizedPicture(cfg['rss-promo-banner'], cfg['rss-promo-banner-alt'] || 'Promo Banner');
      promoBanner = div(div({ class: 'rss-promo-banner' }, bannerPicture));
    }
    
    block.innerHTML = `
      <div class="rss-detail-wrapper${article.image ? '' : ' rss-detail-wrapper--no-image'}">
        ${article.image ? `<div class="rss-detail-image"><img src="${article.image}" alt="${article.title}"></div>` : ''}
        <div class="rss-detail-content">
          <p class="rss-detail-date">${dateText}</p>
          <h1 class="rss-detail-title">${article.title}</h1>
          ${article.creator ? `<p class="rss-detail-author">By ${article.creator}</p>` : ''}
          <div class="rss-detail-body">
            ${article.description}
          </div>
          <div class="rss-detail-category">Category: ${article.category}</div>
        </div>
        ${promoBanner ? promoBanner.innerHTML : ''}
      </div>
    `;
  } else {
    block.innerHTML = '<p class="rss-detail-error">Article not found or expired.</p>';
  }
}