const zdpUrlParams = new URLSearchParams(window.location.search);

const getSearchParam = (param) => zdpUrlParams.get(param);

['zdp-id', 'zdp-env', 'zdp-token', 'zdp-preview'].forEach((key) => {
  const v = getSearchParam(key);
  if (v) {
    sessionStorage.setItem(key, v);
  }
});

const getZdpParam = (name) => getSearchParam(name) || sessionStorage.getItem(name) || '';

const appendScript = (src) => {
  const script = document.createElement('script');
  script.src = src;
  document.head.appendChild(script);
};

/** Map zdp-env values to loader origins; extend when non-prod hosts are known. */
const ZDP_LOADER_ORIGIN_BY_ENV = {
  // stage: 'https://pilot-stage.adobedemo.com',
};

const getZdpLoaderOrigin = (zdpEnv) => {
  const key = String(zdpEnv || '').toLowerCase();
  return ZDP_LOADER_ORIGIN_BY_ENV[key] || 'https://pilot.adobedemo.com';
};

const LEGACY_COPILOT_LOADER = 'https://pilot.adobedemo.com/loader/loader.js';

if (getSearchParam('copilotEditor')) {
  appendScript(LEGACY_COPILOT_LOADER);
} else {
  const zdpId = getZdpParam('zdp-id');
  const zdpEnv = getZdpParam('zdp-env');
  const zdpToken = getZdpParam('zdp-token');
  const zdpPreview = getZdpParam('zdp-preview');

  if (zdpPreview) {
    if (zdpId && zdpEnv) {
      const origin = getZdpLoaderOrigin(zdpEnv);
      appendScript(`${origin}/loader/loader.js`);
    }
  } else if (zdpId && zdpEnv && zdpToken) {
    const origin = getZdpLoaderOrigin(zdpEnv);
    appendScript(`${origin}/loader/loader.js`);
  }
}
