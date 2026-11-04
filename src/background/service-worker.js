importScripts('../shared/settings.js');

async function updateBadge(settings) {
  await chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
}

chrome.runtime.onInstalled.addListener(async () => updateBadge(await IB.load()));
chrome.runtime.onStartup.addListener(async () => updateBadge(await IB.load()));
IB.onChange(updateBadge);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-blur') return;
  const settings = await IB.load();
  await IB.save({ enabled: !settings.enabled });
});
