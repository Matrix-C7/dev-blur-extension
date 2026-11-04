// Shared settings helpers — loaded by the content script, popup and service worker.
globalThis.IB = globalThis.IB || {
  STORAGE_KEY: 'settings',

  DEFAULTS: {
    enabled: true,
    blurAmount: 12,       // px
    revealOnHover: true,
    minSize: 32,          // px — images smaller than this (either side) are treated as icons
    disabledSites: []     // hostnames
  },

  async load() {
    const data = await chrome.storage.sync.get(IB.STORAGE_KEY);
    return { ...IB.DEFAULTS, ...(data[IB.STORAGE_KEY] || {}) };
  },

  async save(partial) {
    const next = { ...(await IB.load()), ...partial };
    await chrome.storage.sync.set({ [IB.STORAGE_KEY]: next });
    return next;
  },

  onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[IB.STORAGE_KEY]) {
        callback({ ...IB.DEFAULTS, ...(changes[IB.STORAGE_KEY].newValue || {}) });
      }
    });
  }
};
