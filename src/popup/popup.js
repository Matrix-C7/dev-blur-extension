const $ = (id) => document.getElementById(id);

let hostname = null;

function render(settings) {
  $('enabled').checked = settings.enabled;
  $('blurAmount').value = settings.blurAmount;
  $('blurValue').textContent = `${settings.blurAmount}px`;
  $('minSize').value = settings.minSize;
  $('minSizeValue').textContent = `${settings.minSize}px`;
  $('revealOnHover').checked = settings.revealOnHover;
  $('siteEnabled').checked = !settings.disabledSites.includes(hostname);
  document.body.classList.toggle('off', !settings.enabled);
}

async function getActiveHostname() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url || '');
    return /^https?:$/.test(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}

async function init() {
  hostname = await getActiveHostname();
  if (hostname) {
    $('siteName').textContent = hostname;
  } else {
    $('siteRow').hidden = true;
  }

  render(await IB.load());

  $('enabled').addEventListener('change', async (e) => render(await IB.save({ enabled: e.target.checked })));

  $('blurAmount').addEventListener('input', (e) => { $('blurValue').textContent = `${e.target.value}px`; });
  $('blurAmount').addEventListener('change', async (e) => render(await IB.save({ blurAmount: Number(e.target.value) })));

  $('minSize').addEventListener('input', (e) => { $('minSizeValue').textContent = `${e.target.value}px`; });
  $('minSize').addEventListener('change', async (e) => render(await IB.save({ minSize: Number(e.target.value) })));

  $('revealOnHover').addEventListener('change', async (e) => render(await IB.save({ revealOnHover: e.target.checked })));

  $('siteEnabled').addEventListener('change', async (e) => {
    const { disabledSites } = await IB.load();
    const sites = new Set(disabledSites);
    if (e.target.checked) sites.delete(hostname); else sites.add(hostname);
    render(await IB.save({ disabledSites: [...sites] }));
  });
}

init();
