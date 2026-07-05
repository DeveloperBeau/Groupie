// Thin typed adapter over the Chrome tab APIs. Actions depend on this
// interface so unit tests can substitute a fake.

export interface TabsApi {
  queryTabs(): Promise<chrome.tabs.Tab[]>;
  queryGroups(): Promise<chrome.tabGroups.TabGroup[]>;
  removeTabs(tabIds: number[]): Promise<void>;
  activateTab(tabId: number): Promise<void>;
  focusWindow(windowId: number): Promise<void>;
  groupTabs(tabIds: number[]): Promise<number>;
  updateGroup(groupId: number, props: { title: string }): Promise<void>;
}

export const chromeTabsApi: TabsApi = {
  queryTabs: () => chrome.tabs.query({}),
  queryGroups: () => chrome.tabGroups.query({}),
  removeTabs: async (tabIds) => {
    const [first, ...rest] = tabIds;
    if (first == null) return;
    await chrome.tabs.remove([first, ...rest]);
  },
  activateTab: async (tabId) => {
    await chrome.tabs.update(tabId, { active: true });
  },
  focusWindow: async (windowId) => {
    await chrome.windows.update(windowId, { focused: true });
  },
  groupTabs: (tabIds) => {
    const [first, ...rest] = tabIds;
    if (first == null) throw new Error("groupTabs requires at least one tab");
    return chrome.tabs.group({ tabIds: [first, ...rest] });
  },
  updateGroup: async (groupId, props) => {
    await chrome.tabGroups.update(groupId, props);
  },
};
