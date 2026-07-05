// List view: tabs sectioned by group, with selection and inline rename.

import type { ManagerState, Tab } from "../state";
import {
  TAB_GROUP_ID_NONE,
  bucketByGroup,
  orderedGroupIds,
  tabIds,
} from "../state";
import { prettyUrl, tabCountLabel } from "../format";
import { createCloseButton, createFavicon, groupColor } from "./shared";

export interface ListEls {
  groupsContainer: HTMLElement;
  emptyState: HTMLElement;
  selectionBar: HTMLElement;
  selectionCount: HTMLElement;
  selectAll: HTMLInputElement;
}

export interface ListHandlers {
  toggleSelect(tabId: number, selected: boolean): void;
  setSelection(tabIds: number[], selected: boolean): void;
  activateTab(tab: Tab): void;
  closeTab(tabId: number): void;
  openGrid(groupId: number): void;
  renameGroup(groupId: number, title: string): void;
}

export function renderList(
  state: ManagerState,
  els: ListEls,
  handlers: ListHandlers,
): void {
  renderSelectionBar(state, els);

  const container = els.groupsContainer;
  container.textContent = "";

  if (state.tabs.length === 0) {
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  const buckets = bucketByGroup(state.tabs);
  for (const gid of orderedGroupIds(state.groups, buckets)) {
    const tabs = buckets.get(gid);
    if (tabs) {
      container.appendChild(renderGroupSection(state, gid, tabs, handlers));
    }
  }
}

function renderSelectionBar(state: ManagerState, els: ListEls): void {
  const count = state.selected.size;
  els.selectionBar.hidden = count === 0;
  els.selectionCount.textContent = `${count} selected`;
  els.selectAll.checked = count > 0 && count === state.tabs.length;
  els.selectAll.indeterminate = count > 0 && count < state.tabs.length;
}

function renderGroupSection(
  state: ManagerState,
  groupId: number,
  tabs: Tab[],
  handlers: ListHandlers,
): HTMLElement {
  const isUngrouped = groupId === TAB_GROUP_ID_NONE;
  const group = state.groups.get(groupId);

  const section = document.createElement("section");
  section.className = "group";

  const head = document.createElement("div");
  head.className = "group-head";

  // Select-all-in-group checkbox.
  const ids = tabIds(tabs);
  const selectedCount = ids.filter((id) => state.selected.has(id)).length;
  const groupSelect = document.createElement("label");
  groupSelect.className = "checkbox";
  groupSelect.title = "Select all tabs in this group";
  const groupSelectInput = document.createElement("input");
  groupSelectInput.type = "checkbox";
  groupSelectInput.checked = ids.length > 0 && selectedCount === ids.length;
  groupSelectInput.indeterminate =
    selectedCount > 0 && selectedCount < ids.length;
  groupSelectInput.addEventListener("change", () => {
    handlers.setSelection(ids, groupSelectInput.checked);
  });
  const groupSelectBox = document.createElement("span");
  groupSelect.appendChild(groupSelectInput);
  groupSelect.appendChild(groupSelectBox);
  head.appendChild(groupSelect);

  const dot = document.createElement("span");
  dot.className = "group-dot";
  dot.style.background = groupColor(groupId, group);
  head.appendChild(dot);

  // Group name: editable input for real groups, static label for ungrouped.
  const nameInput = document.createElement("input");
  nameInput.className = "group-name";
  nameInput.value = isUngrouped ? "Ungrouped" : group?.title || "";
  if (isUngrouped) {
    nameInput.disabled = true;
  } else {
    nameInput.placeholder = "Name this group…";
    nameInput.title = "Rename group";
    nameInput.addEventListener("blur", () => {
      handlers.renameGroup(groupId, nameInput.value.trim());
    });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nameInput.blur();
      if (e.key === "Escape") {
        nameInput.value = group?.title || "";
        nameInput.blur();
      }
    });
  }
  head.appendChild(nameInput);

  const meta = document.createElement("span");
  meta.className = "group-meta";
  meta.textContent = tabCountLabel(tabs.length);
  head.appendChild(meta);

  const headActions = document.createElement("div");
  headActions.className = "group-head-actions";

  const showBtn = document.createElement("button");
  showBtn.className = "btn btn-ghost";
  showBtn.textContent = "Show tabs in group";
  showBtn.addEventListener("click", () => handlers.openGrid(groupId));
  headActions.appendChild(showBtn);

  head.appendChild(headActions);
  section.appendChild(head);

  const list = document.createElement("div");
  list.className = "tab-list";
  for (const tab of tabs) {
    list.appendChild(renderTabRow(state, tab, handlers));
  }
  section.appendChild(list);

  return section;
}

function renderTabRow(
  state: ManagerState,
  tab: Tab,
  handlers: ListHandlers,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "tab-row";
  const tabId = tab.id;
  if (tabId != null && state.selected.has(tabId)) row.classList.add("selected");

  const checkbox = document.createElement("label");
  checkbox.className = "checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = tabId != null && state.selected.has(tabId);
  input.addEventListener("change", () => {
    if (tabId != null) handlers.toggleSelect(tabId, input.checked);
  });
  const box = document.createElement("span");
  checkbox.appendChild(input);
  checkbox.appendChild(box);
  row.appendChild(checkbox);

  row.appendChild(createFavicon(tab, "tab-favicon"));

  const main = document.createElement("div");
  main.className = "tab-main";
  main.title = "Switch to this tab";
  const title = document.createElement("div");
  title.className = "tab-title";
  title.textContent = tab.title || tab.url || "Untitled";
  const url = document.createElement("div");
  url.className = "tab-url";
  url.textContent = prettyUrl(tab.url);
  main.appendChild(title);
  main.appendChild(url);
  main.addEventListener("click", () => handlers.activateTab(tab));
  row.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "tab-row-actions";
  if (tab.pinned) {
    const pin = document.createElement("span");
    pin.className = "pin-badge";
    pin.textContent = "\u{1f4cc}";
    pin.title = "Pinned";
    actions.appendChild(pin);
  }
  actions.appendChild(
    createCloseButton("btn-icon", () => {
      if (tabId != null) handlers.closeTab(tabId);
    }),
  );
  row.appendChild(actions);

  return row;
}
