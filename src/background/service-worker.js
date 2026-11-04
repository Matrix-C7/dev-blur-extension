importScripts('../shared/settings.js');

// ---------- toolbar icon status (per tab) ----------

const ICON_STATES = {
  on: {
    path: { 16: '/icons/icon16.png', 48: '/icons/icon48.png', 128: '/icons/icon128.png' },
    title: 'Image Blur — on'
  },
  off: {
    path: { 16: '/icons/off/icon16.png', 48: '/icons/off/icon48.png', 128: '/icons/off/icon128.png' },
    title: 'Image Blur — off'
  }
};

function isOnFor(url, settings) {
  if (!settings.enabled) return false;
  const host = hostnameOf(url);
  return !host || !settings.disabledSites.includes(host);
}

async function updateTabStatus(tab, settings) {
  const state = ICON_STATES[isOnFor(tab.url, settings) ? 'on' : 'off'];
  const tabId = tab.id;
  try {
    await Promise.all([
      chrome.action.setIcon({ tabId, path: state.path }),
      chrome.action.setBadgeText({ tabId, text: '' }),   // clear badges left by older versions
      chrome.action.setTitle({ tabId, title: state.title })
    ]);
  } catch { /* tab closed meanwhile */ }
}

async function updateAllTabs(settings) {
  settings = settings || await IB.load();
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => updateTabStatus(tab, settings)));
}

// Per-tab icon state is reset by Chrome on navigation, so re-apply it.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === 'loading' || info.url) updateTabStatus(tab, await IB.load());
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try { updateTabStatus(await chrome.tabs.get(tabId), await IB.load()); } catch { /* closed */ }
});

// Chrome does not run content scripts in tabs that were already open when the
// extension was installed or reloaded — inject into them so no page refresh is needed.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(tabs.map((tab) =>
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/shared/settings.js', 'src/content/content.js']
    }).catch(() => { /* restricted page (e.g. Chrome Web Store) */ })
  ));
}

chrome.runtime.onInstalled.addListener(() => {
  updateAllTabs();
  injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(() => updateAllTabs());
IB.onChange(updateAllTabs);

function hostnameOf(url) {
  try {
    const u = new URL(url || '');
    return /^https?:$/.test(u.protocol) ? u.hostname : null;
  } catch {
    return null;
  }
}

// ---------- shortcuts ----------

const DEFAULT_KEYS = { 'toggle-blur': 'Alt+L', 'toggle-site': 'Alt+K' };
const STALE_KEYS = ['Alt+Shift+B'];   // shipped in v1.0.0, kept by Chrome across reloads
let lastRun = { command: null, at: 0 };

async function runCommand(command, tab) {
  // The browser shortcut and the in-page fallback can both fire for one key press.
  const now = Date.now();
  if (lastRun.command === command && now - lastRun.at < 400) return;
  lastRun = { command, at: now };

  const settings = await IB.load();

  // Alt+L — press once to turn blur off, press again to turn it back on.
  if (command === 'toggle-blur') {
    await IB.save({ enabled: !settings.enabled });
    return;
  }

  // Alt+K — same toggle, but only for the current site.
  if (command === 'toggle-site') {
    const host = hostnameOf(tab?.url);
    if (!host) return;
    const sites = new Set(settings.disabledSites);
    if (sites.has(host)) sites.delete(host); else sites.add(host);
    await IB.save({ disabledSites: [...sites] });
  }
}

chrome.commands.onCommand.addListener((command, tab) => runCommand(command, tab));

// Fallback from the content script: Chrome keeps old bindings when an unpacked
// extension is reloaded, and leaves a key unassigned if another extension owns it.
// Skip it when the user has deliberately mapped the command to a different key.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'shortcut' || !DEFAULT_KEYS[msg.command]) return;
  chrome.commands.getAll().then((commands) => {
    const bound = commands.find((c) => c.name === msg.command)?.shortcut || '';
    if (bound && bound !== DEFAULT_KEYS[msg.command] && !STALE_KEYS.includes(bound)) return;
    runCommand(msg.command, sender.tab);
  });
});
