import { readBlockConfig } from "../../scripts/aem.js";

const getDefaultEmbed = (url, title) => `
    <iframe src="${url.href}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position:absolute;" allowfullscreen="" frameborder="0" 
      scrolling="yes" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
      title="${title}" loading="lazy" height="100%" width="100%">
    </iframe>`;

const loadEmbed = (block, link, title) => {
  if (block.classList.contains('embed-is-loaded')) {
    return;
  }

  const url = new URL(link);
  block.innerHTML = getDefaultEmbed(url, title || `Content from ${url.hostname}`);
  block.classList.add('embed-is-loaded');
};

export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  const appUrl = config.url || config.iframeurl || config['iframe-url'] || block.querySelector(':scope > div:first-child')?.textContent?.trim();
  const iframeTitle = config.title || config['iframe-title'] || 'Embedded content';

  if (!appUrl) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      observer.disconnect();
      loadEmbed(block, appUrl, iframeTitle);
    }
  });
  observer.observe(block);
}
