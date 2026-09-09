import { readBlockConfig } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

function embedYoutube(url, autoplay, background) {
  const usp = new URLSearchParams(url.search);
  let suffix = '';
  if (background || autoplay) {
    const suffixParams = {
      autoplay: autoplay ? '1' : '0',
      mute: background ? '1' : '0',
      controls: background ? '0' : '1',
      disablekb: background ? '1' : '0',
      loop: background ? '1' : '0',
      playsinline: background ? '1' : '0',
    };
    suffix = `&${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }
  let vid = usp.get('v') ? encodeURIComponent(usp.get('v')) : '';
  const embed = url.pathname;
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
      <iframe src="https://www.youtube.com${vid ? `/embed/${vid}?rel=0&v=${vid}${suffix}` : embed}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; picture-in-picture" allowfullscreen="" scrolling="no" title="Content from Youtube" loading="lazy"></iframe>
    </div>`;
  return temp.children.item(0);
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  if (autoplay) video.setAttribute('autoplay', '');
  if (background) {
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.removeAttribute('controls');
    video.addEventListener('canplay', () => {
      video.muted = true;
      if (autoplay) video.play();
    });
  }

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', `video/mp4`);
  video.append(sourceEl);

  return video;
}

function setupVideoAnalytics(videoEl, startedEventType, endedEventType) {
  if (!videoEl) return;

  let startedDispatchedForRun = false;

  videoEl.addEventListener('play', () => {
    if (!startedEventType || startedDispatchedForRun) return;
    startedDispatchedForRun = true;
    dispatchCustomEvent(startedEventType);
  });

  videoEl.addEventListener('ended', () => {
    if (endedEventType) dispatchCustomEvent(endedEventType);
    startedDispatchedForRun = false;
  });
}

const loadVideoEmbed = (block, link, autoplay, background, startedEventType, endedEventType) => {
  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  if (isYoutube) {
    const url = new URL(link);
    const embedWrapper = embedYoutube(url, autoplay, background);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    setupVideoAnalytics(videoEl, startedEventType, endedEventType);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

export default function decorate(block) {
  const config = readBlockConfig(block) || {};
  const authoredLink = (config.videourl || config.videoUrl || '').toString().trim();
  const fallbackLink = block.querySelector(':scope div:nth-child(1) > div a')?.innerHTML?.trim() || '';
  const link = authoredLink || fallbackLink;

  const startedEventType = (config['started-event-type'] || config.startedeventtype || '').toString().trim();
  const endedEventType = (config['ended-event-type'] || config.endedeventtype || '').toString().trim();

  block.textContent = '';
  block.dataset.embedLoaded = false;
  const autoplay = block.classList ? block.classList.contains('autoplay') : false;
  const playOnLoad = block.classList ? block.classList.contains('playonload') : false;
  if (!link) return;
  loadVideoEmbed(block, link, playOnLoad, autoplay, startedEventType, endedEventType);
}
