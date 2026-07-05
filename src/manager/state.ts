// Manager state and the pure transforms over it.

export const TAB_GROUP_ID_NONE = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE

export type Tab = chrome.tabs.Tab;
export type TabGroup = chrome.tabGroups.TabGroup;

// A snapshot of a group Groupie has seen open. Chrome gives extensions no API
// for saved-but-inactive tab groups, so Groupie keeps its own record and can
// recreate the group on demand.
export interface RememberedGroup {
  key: string;
  title: string;
  color: `${chrome.tabGroups.Color}`;
  urls: string[];
  lastGroupId: number;
  lastSeen: number;
}

export interface ManagerState {
  tabs: Tab[];
  groups: Map<number, TabGroup>;
  selected: Set<number>;
  saved: import("./group-store").DisplayedSavedGroup[];
  view: "list" | "grid";
  gridGroupId: number | null;
}

export function createState(): ManagerState {
  return {
    tabs: [],
    groups: new Map(),
    selected: new Set(),
    saved: [],
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

export function tabIds(tabs: Tab[]): number[] {
  return tabs.flatMap((t) => (t.id == null ? [] : [t.id]));
}

// Ids of every tab that belongs to a group.
export function groupedTabIds(tabs: Tab[]): number[] {
  return tabIds(tabs.filter((t) => groupIdOf(t) !== TAB_GROUP_ID_NONE));
}

export function allIdsSelected(selected: Set<number>, ids: number[]): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}

// Toggle a block of ids: deselect them all if every one is selected,
// otherwise select them all.
export function toggleIdSet(selected: Set<number>, ids: number[]): void {
  if (allIdsSelected(selected, ids)) {
    for (const id of ids) selected.delete(id);
  } else {
    for (const id of ids) selected.add(id);
  }
}
