// Grid view: card layout for a single group's tabs.

import type { ManagerState, Tab } from "../state";
import { TAB_GROUP_ID_NONE, tabsInGroup } from "../state";
import { prettyUrl, tabCountLabel } from "../format";
import { createCloseButton, createFavicon, groupColor } from "./shared";

export interface GridEls {
  gridGroupDot: HTMLElement;
  gridGroupName: HTMLElement;
  gridGroupCount: HTMLElement;
  gridContainer: HTMLElement;
}

export interface GridHandlers {
  activateTab(tab: Tab): void;
  closeTab(tabId: number): void;
  backToList(): void;
}

export function renderGrid(
  state: ManagerState,
  els: GridEls,
  handlers: GridHandlers,
): void {
  const groupId = state.gridGroupId;
  if (groupId == null) {
    handlers.backToList();
    return;
  }
  const isUngrouped = groupId === TAB_GROUP_ID_NONE;
  const group = state.groups.get(groupId);

  els.gridGroupDot.style.background = groupColor(groupId, group);
  els.gridGroupName.textContent = isUngrouped
    ? "Ungrouped"
    : group?.title || "Unnamed group";

  const tabs = tabsInGroup(state.tabs, groupId);
  els.gridGroupCount.textContent = tabCountLabel(tabs.length);

  const container = els.gridContainer;
  container.textContent = "";

  if (tabs.length === 0) {
    // All of this group's tabs are gone; go back to the list.
    handlers.backToList();
    return;
  }

  for (const tab of tabs) {
    container.appendChild(renderTabCard(tab, handlers));
  }
}

function renderTabCard(tab: Tab, handlers: GridHandlers): HTMLElement {
  const card = document.createElement("div");
  card.className = "tab-card";
  card.title = "Switch to this tab";
  card.addEventListener("click", () => handlers.activateTab(tab));

  card.appendChild(
    createCloseButton("tab-card-close", () => {
      if (tab.id != null) handlers.closeTab(tab.id);
    }),
  );

  const top = document.createElement("div");
  top.className = "tab-card-top";
  top.appendChild(createFavicon(tab, "tab-card-favicon"));
  const title = document.createElement("div");
  title.className = "tab-card-title";
  title.textContent = tab.title || tab.url || "Untitled";
  top.appendChild(title);
  card.appendChild(top);

  const url = document.createElement("div");
  url.className = "tab-card-url";
  url.textContent = prettyUrl(tab.url);
  card.appendChild(url);

  return card;
}
