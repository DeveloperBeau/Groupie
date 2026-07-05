// Groupie background service worker.
// Opens the full-page tab manager when the toolbar icon is clicked, reusing an
// already-open manager tab instead of stacking up new ones.

const MANAGER_PATH = "manager.html";

chrome.action.onClicked.addListener(async () => {
  const managerUrl = chrome.runtime.getURL(MANAGER_PATH);

  try {
    const existing = await chrome.tabs.query({ url: managerUrl });
    if (existing.length > 0) {
      const tab = existing[0];
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url: managerUrl });
  } catch (err) {
    // Fall back to always opening a fresh manager tab.
    console.error("Groupie: failed to open manager", err);
    await chrome.tabs.create({ url: managerUrl });
  }
});
