const $ = (id) => document.getElementById(id);

let tab = null;
let hostname = null;

function siteEnabled(settings) {
  return !hostname || !settings.disabledSites.includes(hostname);
}

function render(settings) {
  const siteOn = siteEnabled(settings);
  const running = settings.enabled && siteOn;

  $('enabled').checked = settings.enabled;
  $('siteEnabled').checked = siteOn;
  $('blurAmount').value = settings.blurAmount;
  $('blurValue').textContent = `${settings.blurAmount}px`;
  $('previewImg').style.filter = `blur(${settings.blurAmount / 3}px)`;
  $('minSize').value = settings.minSize;
  $('minSizeValue').textContent = `${settings.minSize}px`;
  $('revealOnHover').checked = settings.revealOnHover;

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.classList.toggle('selected', Number(btn.dataset.preset) === settings.blurAmount);
  });

  document.body.classList.toggle('disabled', !settings.enabled);
  $('status').classList.toggle('off', !running);
  $('statusText').textContent = !settings.enabled ? 'Paused everywhere'
    : !siteOn ? 'Paused on this site'
    : 'Active';

  refreshCount(running);
}

// Counts blurred elements across every frame of the tab (incl. the theme editor preview).
async function refreshCount(running) {
  const meta = $('siteMeta');
  if (!tab || !hostname) return;
  if (!running) { meta.textContent = 'Blur is paused here'; return; }
  await new Promise((r) => setTimeout(r, 150));   // let content scripts finish their batch
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => document.querySelectorAll('[data-ib-blur],[data-ib-bg]').length
    });
    const total = results.reduce((sum, r) => sum + (r.result || 0), 0);
    meta.textContent = total === 1 ? '1 item blurred' : `${total} items blurred`;
  } catch {
    meta.textContent = 'Reload the page to apply';
  }
}

const DEFAULT_KEYS = { 'toggle-blur': 'Alt+L', 'toggle-site': 'Alt+K' };

// Warn when Chrome's binding differs — it keeps old bindings across reloads.
async function renderShortcuts() {
  const commands = await chrome.commands.getAll();
  const stale = [];
  Object.entries(DEFAULT_KEYS).forEach(([name, key]) => {
    const bound = commands.find((c) => c.name === name)?.shortcut || '';
    if (bound !== key) stale.push(`${key} (Chrome has ${bound || 'no key'})`);
  });
  const note = $('shortcutNote');
  note.hidden = !stale.length;
  note.textContent = stale.length
    ? `Works inside web pages. To also use it on the toolbar and new tabs, set ${stale.join(', ')} under Customize.`
    : '';
}

async function getActiveTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active || null;
}

async function update(partial) {
  render(await IB.save(partial));
}

async function init() {
  tab = await getActiveTab();
  try {
    const url = new URL(tab?.url || '');
    if (/^https?:$/.test(url.protocol)) hostname = url.hostname;
  } catch { /* not a web page */ }

  if (hostname) {
    $('siteName').textContent = hostname;
    if (tab.favIconUrl) $('favicon').src = tab.favIconUrl;
  } else {
    $('siteName').textContent = 'This page';
    $('siteMeta').textContent = 'Blur is not available here';
    $('siteEnabled').disabled = true;
  }

  render(await IB.load());
  renderShortcuts();

  $('enabled').addEventListener('change', (e) => update({ enabled: e.target.checked }));

  $('siteEnabled').addEventListener('change', async (e) => {
    const sites = new Set((await IB.load()).disabledSites);
    if (e.target.checked) sites.delete(hostname); else sites.add(hostname);
    update({ disabledSites: [...sites] });
  });

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => update({ blurAmount: Number(btn.dataset.preset) }));
  });

  $('blurAmount').addEventListener('input', (e) => {
    $('blurValue').textContent = `${e.target.value}px`;
    $('previewImg').style.filter = `blur(${e.target.value / 3}px)`;
  });
  $('blurAmount').addEventListener('change', (e) => update({ blurAmount: Number(e.target.value) }));

  $('minSize').addEventListener('input', (e) => { $('minSizeValue').textContent = `${e.target.value}px`; });
  $('minSize').addEventListener('change', (e) => update({ minSize: Number(e.target.value) }));

  $('revealOnHover').addEventListener('change', (e) => update({ revealOnHover: e.target.checked }));

  $('shortcutsLink').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  // Keep in sync when a shortcut is used while the popup is open.
  IB.onChange(render);
}

init();
