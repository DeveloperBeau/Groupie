// Tab actions with injected dependencies so failure paths are unit-testable
// without a DOM or a real Chrome API.

import type { TabsApi } from "./tabs-api";
import type { ManagerState } from "./state";
import { selectedTabs } from "./state";
import { tabCountLabel } from "./format";

export interface ActionDeps {
  tabsApi: TabsApi;
  notify: (message: string) => void;
  reload: () => Promise<void>;
}

export interface GroupResult {
  grouped: boolean;
}

export interface Actions {
  closeTabs(tabIds: number[]): Promise<void>;
  activateTab(tab: chrome.tabs.Tab): Promise<void>;
  renameGroup(groupId: number, title: string): Promise<void>;
  groupSelected(name: string): Promise<GroupResult>;
}

export function createActions(
  state: ManagerState,
  { tabsApi, notify, reload }: ActionDeps,
): Actions {
  async function closeTabs(tabIds: number[]): Promise<void> {
    if (tabIds.length === 0) return;
    try {
      await tabsApi.removeTabs(tabIds);
      for (const id of tabIds) state.selected.delete(id);
      notify(`Closed ${tabCountLabel(tabIds.length)}.`);
    } catch (err) {
      console.error("Groupie: failed to close tabs", err);
      notify("Couldn't close some tabs.");
    }
    await reload();
  }

  async function activateTab(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id == null) return;
    try {
      await tabsApi.activateTab(tab.id);
      if (tab.windowId != null) {
        await tabsApi.focusWindow(tab.windowId);
      }
    } catch (err) {
      console.error("Groupie: failed to activate tab", err);
    }
  }

  async function renameGroup(groupId: number, title: string): Promise<void> {
    const group = state.groups.get(groupId);
    if (!group || group.title === title) return;
    try {
      await tabsApi.updateGroup(groupId, { title });
      group.title = title;
      notify(title ? `Renamed group to “${title}”.` : "Cleared group name.");
    } catch (err) {
      console.error("Groupie: failed to rename group", err);
      notify("Couldn't rename that group.");
      await reload();
    }
  }

  // Group the selected tabs. Chrome only groups tabs within a single window,
  // so the selection produces one group per window, all with the same name.
  // Pinned tabs can't live in groups; they are skipped rather than silently
  // unpinned. Selection and input are only cleared when a group was created.
  async function groupSelected(name: string): Promise<GroupResult> {
    const selection = selectedTabs(state);
    if (selection.length === 0) return { grouped: false };

    const groupable = selection.filter((t) => !t.pinned);
    const pinnedCount = selection.length - groupable.length;

    if (groupable.length === 0) {
      notify("Pinned tabs can't be grouped.");
      return { grouped: false };
    }

    const byWindow = new Map<number, number[]>();
    for (const tab of groupable) {
      if (tab.id == null || tab.windowId == null) continue;
      const ids = byWindow.get(tab.windowId);
      if (ids) ids.push(tab.id);
      else byWindow.set(tab.windowId, [tab.id]);
    }

    try {
      let created = 0;
      for (const winTabIds of byWindow.values()) {
        const groupId = await tabsApi.groupTabs(winTabIds);
        if (name) {
          await tabsApi.updateGroup(groupId, { title: name });
        }
        created += 1;
      }
      state.selected.clear();
      const across = created > 1 ? ` across ${created} windows` : "";
      const skipped =
        pinnedCount > 0
          ? ` Skipped ${pinnedCount} pinned tab${pinnedCount === 1 ? "" : "s"}.`
          : "";
      notify(
        `Grouped ${tabCountLabel(groupable.length)}${
          name ? ` into “${name}”` : ""
        }${across}.${skipped}`,
      );
      await reload();
      return { grouped: true };
    } catch (err) {
      console.error("Groupie: failed to group tabs", err);
      notify("Couldn't group those tabs.");
      state.selected.clear();
      await reload();
      return { grouped: false };
    }
  }

  return { closeTabs, activateTab, renameGroup, groupSelected };
}
