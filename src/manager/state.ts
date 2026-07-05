// Manager state and the pure transforms over it.

export const TAB_GROUP_ID_NONE = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE

export type Tab = chrome.tabs.Tab;
export type TabGroup = chrome.tabGroups.TabGroup;

export interface ManagerState {
  tabs: Tab[];
  groups: Map<number, TabGroup>;
  selected: Set<number>;
  view: "list" | "grid";
  gridGroupId: number | null;
}

export function createState(): ManagerState {
  return {
    tabs: [],
    groups: new Map(),
    selected: new Set(),
    view: "list",
    gridGroupId: null,
  };
}

export function groupIdOf(tab: Tab): number {
  return tab.groupId ?? TAB_GROUP_ID_NONE;
}

// Bucket tabs by group id, preserving tab order within each bucket.
export function bucketByGroup(tabs: Tab[]): Map<number, Tab[]> {
  const buckets = new Map<number, Tab[]>();
  for (const tab of tabs) {
    const gid = groupIdOf(tab);
    const bucket = buckets.get(gid);
    if (bucket) bucket.push(tab);
    else buckets.set(gid, [tab]);
  }
  return buckets;
}

// Group ids in display order: real groups as Chrome reports them (only those
// with tabs), then the ungrouped bucket last.
export function orderedGroupIds(
  groups: Map<number, TabGroup>,
  buckets: Map<number, Tab[]>,
): number[] {
  const ordered = [...groups.keys()].filter((gid) => buckets.has(gid));
  if (buckets.has(TAB_GROUP_ID_NONE)) ordered.push(TAB_GROUP_ID_NONE);
  return ordered;
}

// Drop selections for tabs that no longer exist.
export function pruneSelection(selected: Set<number>, tabs: Tab[]): void {
  const liveIds = new Set(tabs.map((t) => t.id));
  for (const id of [...selected]) {
    if (!liveIds.has(id)) selected.delete(id);
  }
}

export function tabsInGroup(tabs: Tab[], groupId: number): Tab[] {
  return tabs.filter((t) => groupIdOf(t) === groupId);
}

export function selectedTabs(state: ManagerState): Tab[] {
  return state.tabs.filter((t) => t.id != null && state.selected.has(t.id));
}
