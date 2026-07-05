// Groupie background service worker.
// Opens the full-page tab manager when the toolbar icon is clicked, reusing an
// already-open manager tab instead of stacking up new ones. Also snapshots
// open tab groups into storage so the manager can list and reopen groups that
// are no longer open — Chrome offers no API for its own saved-groups store,
// so capturing groups the moment they're open is the only way to see them.

import {
  loadRemembered,
  saveRemembered,
  snapshotOpenGroups,
  syncRemembered,
} from "./manager/group-store";

const MANAGER_PATH = "manager.html";

chrome.action.onClicked.addListener(() => {
  void openManager();
});

async function openManager(): Promise<void> {
  const managerUrl = chrome.runtime.getURL(MANAGER_PATH);

  try {
    const existing = await chrome.tabs.query({ url: managerUrl });
    const tab = existing[0];
    if (tab?.id != null) {
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
}

// ---------- Group snapshotting ----------

async function snapshotGroups(): Promise<void> {
  try {
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
    ]);
    const stored = await loadRemembered();
    const { all } = syncRemembered(
      stored,
      snapshotOpenGroups(tabs, new Map(groups.map((g) => [g.id, g]))),
      Date.now(),
    );
    await saveRemembered(all);
  } catch (err) {
    console.error("Groupie: failed to snapshot groups", err);
  }
}

let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSnapshot(): void {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => void snapshotGroups(), 500);
}

chrome.tabGroups.onCreated.addListener(scheduleSnapshot);
chrome.tabGroups.onUpdated.addListener(scheduleSnapshot);
chrome.tabGroups.onMoved.addListener(scheduleSnapshot);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if ("groupId" in changeInfo || "url" in changeInfo || "title" in changeInfo) {
    scheduleSnapshot();
  }
});
chrome.runtime.onStartup.addListener(scheduleSnapshot);
chrome.runtime.onInstalled.addListener(scheduleSnapshot);
