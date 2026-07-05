// Manager page bootstrap: element caching, data loading, and event wiring.

import {
  allIdsSelected,
  createState,
  groupedTabIds,
  pruneSelection,
  toggleIdSet,
} from "./state";
import { chromeTabsApi } from "./tabs-api";
import { createActions } from "./actions";
import {
  forgetRemembered,
  loadRemembered,
  mergeSavedGroups,
  saveRemembered,
  snapshotOpenGroups,
  syncRemembered,
  type DisplayedSavedGroup,
} from "./group-store";
import type { RememberedGroup } from "./state";
import { fetchNativeSavedGroups } from "./native-host";
import { renderList } from "./render/list";
import { renderGrid } from "./render/grid";
import { renderRemembered } from "./render/remembered";
import { createToaster } from "./render/shared";
import { tabCountLabel } from "./format";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Groupie: missing element #${id}`);
  return found as T;
}

document.addEventListener("DOMContentLoaded", () => {
  const els = {
    tabCount: el("tab-count"),
    selectGroupsBtn: el<HTMLButtonElement>("select-groups-btn"),
    refreshBtn: el<HTMLButtonElement>("refresh-btn"),
    listView: el("list-view"),
    gridView: el("grid-view"),
    selectionBar: el("selection-bar"),
    selectAll: el<HTMLInputElement>("select-all"),
    selectionCount: el("selection-count"),
    newGroupName: el<HTMLInputElement>("new-group-name"),
    groupBtn: el<HTMLButtonElement>("group-btn"),
    deleteBtn: el<HTMLButtonElement>("delete-btn"),
    groupsContainer: el("groups-container"),
    rememberedContainer: el("remembered-container"),
    emptyState: el("empty-state"),
    backBtn: el<HTMLButtonElement>("back-btn"),
    gridGroupDot: el("grid-group-dot"),
    gridGroupName: el("grid-group-name"),
    gridGroupCount: el("grid-group-count"),
    gridContainer: el("grid-container"),
    toast: el("toast"),
  };

  const state = createState();
  const toast = createToaster(els.toast);
  const managerUrl = chrome.runtime.getURL("manager.html");

  // Only the newest in-flight load may commit, so a slow older query can't
  // overwrite fresher data.
  let loadSeq = 0;
  async function loadData(): Promise<void> {
    const seq = ++loadSeq;
    const [tabs, groups] = await Promise.all([
      chromeTabsApi.queryTabs(),
      chromeTabsApi.queryGroups(),
    ]);
    if (seq !== loadSeq) return;

    // Manager tabs (this one and any duplicates) never appear in the list.
    state.tabs = tabs.filter(
      (t) => t.url !== managerUrl && t.pendingUrl !== managerUrl,
    );
    state.groups = new Map(groups.map((g) => [g.id, g]));
    pruneSelection(state.selected, state.tabs);

    // Render the tab list before anything else: the saved-groups sync below
    // touches chrome.storage, and a failure or hang there must never keep
    // the core UI from appearing.
    render();

    // Best-effort from here down; failures only cost the saved-groups
    // section, never the tab list.
    const open = snapshotOpenGroups(state.tabs, state.groups);
    let notOpen: RememberedGroup[] = [];
    try {
      const stored = await loadRemembered();
      const synced = syncRemembered(stored, open, Date.now());
      await saveRemembered(synced.all);
      notOpen = synced.notOpen;
    } catch (err) {
      console.error("Groupie: failed to sync saved groups", err);
    }
    const native = await fetchNativeSavedGroups();
    if (seq !== loadSeq) return;
    state.saved = mergeSavedGroups(native, notOpen, open);
    render();
  }

  const actions = createActions(state, {
    tabsApi: chromeTabsApi,
    notify: toast,
    reload: loadData,
  });

  function render(): void {
    els.tabCount.textContent = tabCountLabel(state.tabs.length);

    const grouped = groupedTabIds(state.tabs);
    els.selectGroupsBtn.hidden = state.view === "grid" || grouped.length === 0;
    els.selectGroupsBtn.textContent = allIdsSelected(state.selected, grouped)
      ? "Deselect all groups"
      : "Select all groups";

    if (state.view === "grid") {
      els.listView.hidden = true;
      els.gridView.hidden = false;
      renderGrid(state, els, gridHandlers);
    } else {
      els.gridView.hidden = true;
      els.listView.hidden = false;
      renderList(state, els, listHandlers);
      renderRemembered(els.rememberedContainer, state.saved, {
        reopenGroup: (group: DisplayedSavedGroup) =>
          void actions.reopenGroup(group),
        forgetGroup: (group: DisplayedSavedGroup) =>
          void forgetRemembered(group.key).then(loadData),
      });
    }
  }

  function openGrid(groupId: number): void {
    state.gridGroupId = groupId;
    state.view = "grid";
    render();
  }

  function backToList(): void {
    state.view = "list";
    state.gridGroupId = null;
    render();
  }

  function toggleSelect(tabId: number, selected: boolean): void {
    if (selected) state.selected.add(tabId);
    else state.selected.delete(tabId);
    render();
  }

  function toggleSelectAll(selected: boolean): void {
    state.selected.clear();
    if (selected) {
      for (const tab of state.tabs) {
        if (tab.id != null) state.selected.add(tab.id);
      }
    }
    render();
  }

  function setSelection(tabIds: number[], selected: boolean): void {
    for (const id of tabIds) {
      if (selected) state.selected.add(id);
      else state.selected.delete(id);
    }
    render();
  }

  const listHandlers = {
    toggleSelect,
    setSelection,
    activateTab: (tab: chrome.tabs.Tab) => void actions.activateTab(tab),
    closeTab: (tabId: number) => void actions.closeTabs([tabId]),
    openGrid,
    renameGroup: (groupId: number, title: string) => {
      void actions.renameGroup(groupId, title).then(flushPendingReload);
    },
  };

  const gridHandlers = {
    activateTab: (tab: chrome.tabs.Tab) => void actions.activateTab(tab),
    closeTab: (tabId: number) => void actions.closeTabs([tabId]),
    backToList,
  };

  // Debounced reload for live Chrome events. While the user is editing a group
  // name the reload is deferred (not polled) and flushed when editing ends.
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingReload = false;
  function scheduleReload(): void {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.classList.contains("group-name")
      ) {
        pendingReload = true;
        return;
      }
      void loadData();
    }, 300);
  }
  function flushPendingReload(): void {
    if (pendingReload) {
      pendingReload = false;
      void loadData();
    }
  }

  function attachEvents(): void {
    els.refreshBtn.addEventListener("click", () => void loadData());
    els.selectGroupsBtn.addEventListener("click", () => {
      toggleIdSet(state.selected, groupedTabIds(state.tabs));
      render();
    });
    els.selectAll.addEventListener("change", () =>
      toggleSelectAll(els.selectAll.checked),
    );
    els.deleteBtn.addEventListener(
      "click",
      () => void actions.closeTabs([...state.selected]),
    );
    const groupSelected = async () => {
      const { grouped } = await actions.groupSelected(
        els.newGroupName.value.trim(),
      );
      if (grouped) els.newGroupName.value = "";
    };
    els.groupBtn.addEventListener("click", () => void groupSelected());
    els.newGroupName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void groupSelected();
    });
    els.backBtn.addEventListener("click", backToList);

    // Keep the manager fresh as tabs/groups change elsewhere. onUpdated fires
    // for lots of transient states (loading progress, audio, etc.); only the
    // fields this UI shows should trigger a rebuild.
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (
        "title" in changeInfo ||
        "favIconUrl" in changeInfo ||
        "url" in changeInfo ||
        "pinned" in changeInfo ||
        "groupId" in changeInfo
      ) {
        scheduleReload();
      }
    });
    const events: Array<{ addListener(callback: () => void): void }> = [
      chrome.tabs.onCreated,
      chrome.tabs.onRemoved,
      chrome.tabs.onMoved,
      chrome.tabs.onAttached,
      chrome.tabs.onDetached,
      chrome.tabGroups.onCreated,
      chrome.tabGroups.onRemoved,
      chrome.tabGroups.onUpdated,
      chrome.tabGroups.onMoved,
    ];
    for (const ev of events) {
      ev.addListener(scheduleReload);
    }
  }

  attachEvents();
  void loadData();
});
