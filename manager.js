// Groupie tab manager UI logic (runs inside manager.html).

const TAB_GROUP_ID_NONE = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE

// Chrome tab-group color names -> display hex.
const GROUP_COLORS = {
  grey: "#5f6368",
  blue: "#8ab4f8",
  red: "#f28b82",
  yellow: "#fdd663",
  green: "#81c995",
  pink: "#ff8bcb",
  purple: "#c58af9",
  cyan: "#78d9ec",
  orange: "#fcad70",
};

// Neutral globe fallback for tabs with no / unreachable favicon.
const FALLBACK_FAVICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="%236b7488" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>'
  );

// ---------- State ----------
const state = {
  tabs: [],
  groups: new Map(), // groupId -> group object
  selected: new Set(), // selected tab ids
  view: "list", // "list" | "grid"
  gridGroupId: null, // group id being shown in grid view (or TAB_GROUP_ID_NONE)
  selfTabId: null, // this manager tab, excluded from the list
};

// ---------- DOM refs ----------
const els = {};
function cacheEls() {
  const ids = [
    "tab-count",
    "refresh-btn",
    "list-view",
    "grid-view",
    "selection-bar",
    "select-all",
    "selection-count",
    "new-group-name",
    "group-btn",
    "delete-btn",
    "groups-container",
    "empty-state",
    "back-btn",
    "grid-group-dot",
    "grid-group-name",
    "grid-group-count",
    "grid-container",
    "toast",
  ];
  for (const id of ids) {
    els[camel(id)] = document.getElementById(id);
  }
}
function camel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

// ---------- Data loading ----------
async function loadData() {
  const current = await chrome.tabs.getCurrent();
  state.selfTabId = current ? current.id : null;

  const [tabs, groups] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
  ]);

  state.tabs = tabs.filter((t) => t.id !== state.selfTabId);
  state.groups = new Map(groups.map((g) => [g.id, g]));

  // Drop selections for tabs that no longer exist.
  const liveIds = new Set(state.tabs.map((t) => t.id));
  for (const id of [...state.selected]) {
    if (!liveIds.has(id)) state.selected.delete(id);
  }

  render();
}

// ---------- Rendering ----------
function render() {
  els.tabCount.textContent = `${state.tabs.length} tab${
    state.tabs.length === 1 ? "" : "s"
  }`;

  if (state.view === "grid") {
    els.listView.hidden = true;
    els.gridView.hidden = false;
    renderGrid();
  } else {
    els.gridView.hidden = true;
    els.listView.hidden = false;
    renderList();
  }
}

function renderList() {
  renderSelectionBar();

  const container = els.groupsContainer;
  container.textContent = "";

  if (state.tabs.length === 0) {
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  // Bucket tabs by group id, preserving tab order.
  const buckets = new Map(); // groupId -> tabs[]
  for (const tab of state.tabs) {
    const gid = tab.groupId != null ? tab.groupId : TAB_GROUP_ID_NONE;
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid).push(tab);
  }

  // Render real groups first (in the order Chrome reports them), then ungrouped.
  const orderedGroupIds = [...state.groups.keys()].filter((gid) =>
    buckets.has(gid)
  );
  for (const gid of orderedGroupIds) {
    container.appendChild(renderGroupSection(gid, buckets.get(gid)));
  }
  if (buckets.has(TAB_GROUP_ID_NONE)) {
    container.appendChild(
      renderGroupSection(TAB_GROUP_ID_NONE, buckets.get(TAB_GROUP_ID_NONE))
    );
  }
}

function renderGroupSection(groupId, tabs) {
  const isUngrouped = groupId === TAB_GROUP_ID_NONE;
  const group = state.groups.get(groupId);

  const section = document.createElement("section");
  section.className = "group";

  const head = document.createElement("div");
  head.className = "group-head";

  const dot = document.createElement("span");
  dot.className = "group-dot";
  dot.style.background = isUngrouped
    ? "var(--text-faint)"
    : GROUP_COLORS[group?.color] || "var(--text-faint)";
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
    const commit = () => renameGroup(groupId, nameInput.value.trim());
    nameInput.addEventListener("blur", commit);
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
  meta.textContent = `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
  head.appendChild(meta);

  const headActions = document.createElement("div");
  headActions.className = "group-head-actions";

  const showBtn = document.createElement("button");
  showBtn.className = "btn btn-ghost";
  showBtn.textContent = "Show tabs in group";
  showBtn.addEventListener("click", () => openGrid(groupId));
  headActions.appendChild(showBtn);

  head.appendChild(headActions);
  section.appendChild(head);

  const list = document.createElement("div");
  list.className = "tab-list";
  for (const tab of tabs) {
    list.appendChild(renderTabRow(tab));
  }
  section.appendChild(list);

  return section;
}

function renderTabRow(tab) {
  const row = document.createElement("div");
  row.className = "tab-row";
  if (state.selected.has(tab.id)) row.classList.add("selected");

  const checkbox = document.createElement("label");
  checkbox.className = "checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = state.selected.has(tab.id);
  input.addEventListener("change", () => toggleSelect(tab.id, input.checked));
  const box = document.createElement("span");
  checkbox.appendChild(input);
  checkbox.appendChild(box);
  row.appendChild(checkbox);

  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src = tab.favIconUrl || FALLBACK_FAVICON;
  favicon.addEventListener("error", () => {
    favicon.src = FALLBACK_FAVICON;
  });
  row.appendChild(favicon);

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
  main.addEventListener("click", () => activateTab(tab));
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
  const close = document.createElement("button");
  close.className = "btn-icon";
  close.innerHTML = "&#x2715;";
  close.title = "Close tab";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTabs([tab.id]);
  });
  actions.appendChild(close);
  row.appendChild(actions);

  return row;
}

function renderSelectionBar() {
  const count = state.selected.size;
  els.selectionBar.hidden = count === 0;
  els.selectionCount.textContent = `${count} selected`;
  els.selectAll.checked = count > 0 && count === state.tabs.length;
}

// ---------- Grid view ----------
function openGrid(groupId) {
  state.gridGroupId = groupId;
  state.view = "grid";
  render();
}

function renderGrid() {
  const groupId = state.gridGroupId;
  const isUngrouped = groupId === TAB_GROUP_ID_NONE;
  const group = state.groups.get(groupId);

  els.gridGroupDot.style.background = isUngrouped
    ? "var(--text-faint)"
    : GROUP_COLORS[group?.color] || "var(--text-faint)";
  els.gridGroupName.textContent = isUngrouped
    ? "Ungrouped"
    : group?.title || "Unnamed group";

  const tabs = state.tabs.filter((t) => {
    const gid = t.groupId != null ? t.groupId : TAB_GROUP_ID_NONE;
    return gid === groupId;
  });

  els.gridGroupCount.textContent = `${tabs.length} tab${
    tabs.length === 1 ? "" : "s"
  }`;

  const container = els.gridContainer;
  container.textContent = "";

  if (tabs.length === 0) {
    // All of this group's tabs are gone; go back to the list.
    backToList();
    return;
  }

  for (const tab of tabs) {
    container.appendChild(renderTabCard(tab));
  }
}

function renderTabCard(tab) {
  const card = document.createElement("div");
  card.className = "tab-card";
  card.title = "Switch to this tab";
  card.addEventListener("click", () => activateTab(tab));

  const close = document.createElement("button");
  close.className = "tab-card-close";
  close.innerHTML = "&#x2715;";
  close.title = "Close tab";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTabs([tab.id]);
  });
  card.appendChild(close);

  const top = document.createElement("div");
  top.className = "tab-card-top";
  const favicon = document.createElement("img");
  favicon.className = "tab-card-favicon";
  favicon.src = tab.favIconUrl || FALLBACK_FAVICON;
  favicon.addEventListener("error", () => {
    favicon.src = FALLBACK_FAVICON;
  });
  top.appendChild(favicon);
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

function backToList() {
  state.view = "list";
  state.gridGroupId = null;
  render();
}

// ---------- Actions ----------
function toggleSelect(tabId, selected) {
  if (selected) state.selected.add(tabId);
  else state.selected.delete(tabId);
  render();
}

function toggleSelectAll(selected) {
  state.selected.clear();
  if (selected) {
    for (const tab of state.tabs) state.selected.add(tab.id);
  }
  render();
}

async function closeTabs(tabIds) {
  if (tabIds.length === 0) return;
  try {
    await chrome.tabs.remove(tabIds);
    for (const id of tabIds) state.selected.delete(id);
    toast(
      `Closed ${tabIds.length} tab${tabIds.length === 1 ? "" : "s"}.`
    );
    await loadData();
  } catch (err) {
    console.error("Groupie: failed to close tabs", err);
    toast("Couldn't close some tabs.");
    await loadData();
  }
}

async function deleteSelected() {
  await closeTabs([...state.selected]);
}

async function activateTab(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch (err) {
    console.error("Groupie: failed to activate tab", err);
  }
}

async function renameGroup(groupId, title) {
  const group = state.groups.get(groupId);
  if (!group || group.title === title) return;
  try {
    await chrome.tabGroups.update(groupId, { title });
    if (state.groups.has(groupId)) state.groups.get(groupId).title = title;
    toast(title ? `Renamed group to “${title}”.` : "Cleared group name.");
  } catch (err) {
    console.error("Groupie: failed to rename group", err);
    toast("Couldn't rename that group.");
    await loadData();
  }
}

// Group selected tabs. Chrome only groups tabs within a single window, so we
// create one group per window the selection spans and give them all the same
// name.
async function groupSelected() {
  const ids = [...state.selected];
  if (ids.length === 0) return;

  const name = els.newGroupName.value.trim();

  // Bucket selected tab ids by window.
  const byWindow = new Map();
  for (const tab of state.tabs) {
    if (!state.selected.has(tab.id)) continue;
    if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
    byWindow.get(tab.windowId).push(tab.id);
  }

  try {
    let created = 0;
    for (const winTabIds of byWindow.values()) {
      const groupId = await chrome.tabs.group({ tabIds: winTabIds });
      if (name) {
        await chrome.tabGroups.update(groupId, { title: name });
      }
      created += 1;
    }
    state.selected.clear();
    els.newGroupName.value = "";
    const across =
      created > 1 ? ` across ${created} windows` : "";
    toast(
      `Grouped ${ids.length} tab${ids.length === 1 ? "" : "s"}${
        name ? ` into “${name}”` : ""
      }${across}.`
    );
    await loadData();
  } catch (err) {
    console.error("Groupie: failed to group tabs", err);
    toast("Couldn't group those tabs.");
    await loadData();
  }
}

// ---------- Helpers ----------
function prettyUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

// Debounced reload so live Chrome tab/group events don't thrash the UI.
// Skips while the user is editing a group name so their typing isn't wiped by
// a rebuild triggered by unrelated background tab activity.
let reloadTimer = null;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const active = document.activeElement;
    if (active && active.classList.contains("group-name")) {
      scheduleReload();
      return;
    }
    loadData();
  }, 300);
}

// ---------- Wire up ----------
function attachEvents() {
  els.refreshBtn.addEventListener("click", () => loadData());
  els.selectAll.addEventListener("change", (e) =>
    toggleSelectAll(e.target.checked)
  );
  els.deleteBtn.addEventListener("click", () => deleteSelected());
  els.groupBtn.addEventListener("click", () => groupSelected());
  els.newGroupName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") groupSelected();
  });
  els.backBtn.addEventListener("click", () => backToList());

  // Keep the manager fresh as tabs/groups change elsewhere.
  const events = [
    chrome.tabs.onCreated,
    chrome.tabs.onRemoved,
    chrome.tabs.onUpdated,
    chrome.tabs.onMoved,
    chrome.tabs.onAttached,
    chrome.tabs.onDetached,
    chrome.tabGroups.onCreated,
    chrome.tabGroups.onRemoved,
    chrome.tabGroups.onUpdated,
    chrome.tabGroups.onMoved,
  ];
  for (const ev of events) {
    if (ev && ev.addListener) ev.addListener(scheduleReload);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  cacheEls();
  attachEvents();
  await loadData();
});
