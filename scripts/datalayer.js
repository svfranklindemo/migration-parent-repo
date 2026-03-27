// ==========================================
// DataLayer Management System - Secur Financial
// Only properties present in data-elements.json are initialized.
// No checkout (not in data-elements). Cart has only total (Reservation-TotalValue).
// ==========================================

window._dataLayerQueue = window._dataLayerQueue || [];
window._dataLayerReady = false;
window._dataLayerUpdating = false;

let _dataLayer = null;

const STORAGE_KEY = 'secur_financial_dataLayer';
const STORAGE_TIMESTAMP_KEY = 'secur_financial_dataLayer_timestamp';
const STORAGE_TTL = 30 * 24 * 60 * 60 * 1000;
const ECID_SESSION_KEY = 'com.adobe.reactor.dataElements.ECID';

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target, source) {
  if (!target) {
    return isObject(source) ? { ...source } : source;
  }
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!target[key] || !isObject(target[key])) {
          output[key] = { ...source[key] };
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

function getEcidFromSession() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const ecid = sessionStorage.getItem(ECID_SESSION_KEY);
      return (ecid && String(ecid).trim()) || '';
    }
  } catch (e) {
    // ignore
  }
  return '';
}

function applyEcidToDataLayer() {
  if (!_dataLayer || !_dataLayer._demosystem4) return;
  const ecid = getEcidFromSession();
  if (!_dataLayer._demosystem4.identification) _dataLayer._demosystem4.identification = {};
  const core = _dataLayer._demosystem4.identification.core;
  if (!core) {
    _dataLayer._demosystem4.identification.core = { ecid: '', email: null, loyaltyId: '', isMember: 'n' };
  }
  _dataLayer._demosystem4.identification.core.ecid = ecid || _dataLayer._demosystem4.identification.core.ecid || '';
}

function syncWindowDataLayer() {
  window.dataLayer = _dataLayer;
}

function getPageNameFromPathname(pathname) {
  const normalized = (pathname || '').replace(/\/+$/, '');
  if (!normalized || normalized === '/') return 'home';
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length) return 'home';
  const lastSegment = (segments[segments.length - 1] || '').toLowerCase();
  const isLocaleOnly = /^[a-z]{2}(?:-[a-z]{2})?$/.test(lastSegment);
  return isLocaleOnly ? 'home' : lastSegment;
}

function dispatchDataLayerEvent(eventType = 'initialized') {
  document.dispatchEvent(
    new CustomEvent('dataLayerUpdated', {
      bubbles: true,
      detail: {
        dataLayer: JSON.parse(JSON.stringify(_dataLayer)),
        type: eventType,
      },
    })
  );
}

function processDataLayerQueue() {
  if (window._dataLayerQueue && window._dataLayerQueue.length > 0) {
    window._dataLayerQueue.forEach((queuedUpdate) => {
      const { updates, merge } = queuedUpdate;
      if (merge) {
        _dataLayer = deepMerge(_dataLayer, updates);
      } else {
        _dataLayer = { ..._dataLayer, ...updates };
      }
    });
    syncWindowDataLayer();
    try {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (storageError) {
      console.warn('⚠ Could not persist dataLayer:', storageError.message);
    }
    window._dataLayerQueue = [];
    dispatchDataLayerEvent('updated');
  }
}

/**
 * Initial dataLayer structure only from paths in data-elements.json.
 * project: only id, currency (Project-ID, Currency). No locale.
 * cart: only total (Reservation-TotalValue).
 */
function getInitialDataLayerFromDataElements() {
  const initialDataLayer = {
    page: {},
    product: {},
    mortgage: {},
    partnerData: {},
    project: {
      id: "securfinancial2"
    },
    wizard: {}
  };
  return initialDataLayer;
}

export function buildCustomDataLayer() {
  try {
    const savedDataLayer = localStorage.getItem(STORAGE_KEY);
    const savedTimestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);

    let isDataValid = false;
    if (savedDataLayer && savedTimestamp) {
      const cacheAge = Date.now() - parseInt(savedTimestamp, 10);
      if (cacheAge <= STORAGE_TTL) {
        isDataValid = true;
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      }
    }
    if (savedDataLayer && isDataValid) {
      _dataLayer = JSON.parse(savedDataLayer);
    } else {
      _dataLayer = getInitialDataLayerFromDataElements();
    }
    applyEcidToDataLayer();
    if (!_dataLayer.page) _dataLayer.page = {};
    _dataLayer.page.title = document.title || _dataLayer.page.title;
    const pathName = (window.location && window.location.pathname) || '';
    _dataLayer.page.name = getPageNameFromPathname(pathName) || _dataLayer.page.name;
    syncWindowDataLayer();

    try {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
      localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
    } catch (storageError) {
      console.warn('⚠ Could not persist dataLayer:', storageError.message);
    }

    window._dataLayerReady = true;
    processDataLayerQueue();

    setTimeout(() => {
      dispatchDataLayerEvent(savedDataLayer ? 'restored' : 'initialized');
    }, 0);
  } catch (error) {
    console.error('Error initializing dataLayer:', error);
    _dataLayer = getInitialDataLayerFromDataElements();
    syncWindowDataLayer();
    window._dataLayerReady = true;
    processDataLayerQueue();
  }
}

window.updateDataLayer = function (updates, merge = true) {
  if (!updates || typeof updates !== 'object') {
    console.error('Invalid updates provided to updateDataLayer');
    return;
  }
  if (!window._dataLayerReady || !_dataLayer) {
    window._dataLayerQueue.push({ updates, merge });
    return;
  }
  window._dataLayerUpdating = true;
  if (merge) {
    _dataLayer = deepMerge(_dataLayer, updates);
  } else {
    _dataLayer = { ..._dataLayer, ...updates };
  }
  syncWindowDataLayer();
  try {
    const now = Date.now().toString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
  } catch (storageError) {
    console.warn('⚠ Could not persist dataLayer:', storageError.message);
  }
  window._dataLayerUpdating = false;
  dispatchDataLayerEvent('updated');
};

window.resetDataLayerToInitial = function (options = {}) {
  const initialDataLayer = getInitialDataLayerFromDataElements();
  const preserveEcid = options.preserveEcid !== false;
  const updatePageContext = options.updatePageContext !== false;

  window._dataLayerUpdating = true;
  _dataLayer = JSON.parse(JSON.stringify(initialDataLayer));

  if (preserveEcid) {
    applyEcidToDataLayer();
  }

  if (updatePageContext) {
    if (!_dataLayer.page) _dataLayer.page = {};
    _dataLayer.page.title = document.title || _dataLayer.page.title;
    const pathName = (window.location && window.location.pathname) || '';
    _dataLayer.page.name = getPageNameFromPathname(pathName) || _dataLayer.page.name;
  }

  syncWindowDataLayer();
  try {
    const now = Date.now().toString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_dataLayer));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, now);
  } catch (storageError) {
    console.warn('⚠ Could not persist dataLayer:', storageError.message);
  }

  window._dataLayerUpdating = false;
  dispatchDataLayerEvent('replaced');
};

window.getDataLayerProperty = function (path) {
  if (!_dataLayer) return undefined;
  if (!path) return JSON.parse(JSON.stringify(_dataLayer));
  const keys = path.split('.');
  let value = _dataLayer;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }
  return typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
};

window.clearDataLayer = function () {
  window._dataLayerQueue = [];
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
};

window.getDataLayerQueueStatus = function () {
  return {
    ready: window._dataLayerReady,
    dataLayerQueueLength: window._dataLayerQueue ? window._dataLayerQueue.length : 0,
    dataLayerQueue: window._dataLayerQueue || [],
  };
};

buildCustomDataLayer();
