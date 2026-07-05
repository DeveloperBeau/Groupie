import { describe, expect, it, vi } from "vitest";
import { createActions, type ActionDeps } from "../src/manager/actions";
import { createState, type ManagerState, type Tab } from "../src/manager/state";
import type { TabsApi } from "../src/manager/tabs-api";

function tab(
  id: number,
  { windowId = 1, pinned = false }: { windowId?: number; pinned?: boolean } = {},
): Tab {
  return { id, windowId, pinned, groupId: -1 } as Tab;
}

function fakeApi(overrides: Partial<TabsApi> = {}): TabsApi {
  return {
    queryTabs: vi.fn().mockResolvedValue([]),
    queryGroups: vi.fn().mockResolvedValue([]),
    removeTabs: vi.fn().mockResolvedValue(undefined),
    activateTab: vi.fn().mockResolvedValue(undefined),
    focusWindow: vi.fn().mockResolvedValue(undefined),
    groupTabs: vi.fn().mockResolvedValue(100),
    updateGroup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setup(
  state: ManagerState,
  apiOverrides: Partial<TabsApi> = {},
): { deps: ActionDeps; notify: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> } {
  const notify = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const deps = { tabsApi: fakeApi(apiOverrides), notify, reload };
  return { deps, notify, reload };
}

describe("closeTabs", () => {
  it("removes tabs, clears their selection, notifies, reloads", async () => {
    const state = createState();
    state.selected = new Set([1, 2, 3]);
    const { deps, notify, reload } = setup(state);
    const actions = createActions(state, deps);

    await actions.closeTabs([1, 2]);

    expect(deps.tabsApi.removeTabs).toHaveBeenCalledWith([1, 2]);
    expect([...state.selected]).toEqual([3]);
    expect(notify).toHaveBeenCalledWith("Closed 2 tabs.");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("surfaces a failure notification and still reloads", async () => {
    const state = createState();
    const { deps, notify, reload } = setup(state, {
      removeTabs: vi.fn().mockRejectedValue(new Error("gone")),
    });
    const actions = createActions(state, deps);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await actions.closeTabs([1]);

    expect(notify).toHaveBeenCalledWith("Couldn't close some tabs.");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing for an empty id list", async () => {
    const state = createState();
    const { deps, notify, reload } = setup(state);
    const actions = createActions(state, deps);

    await actions.closeTabs([]);

    expect(deps.tabsApi.removeTabs).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("renameGroup", () => {
  function stateWithGroup(id: number, title: string): ManagerState {
    const state = createState();
    state.groups = new Map([[id, { id, title, color: "blue" } as chrome.tabGroups.TabGroup]]);
    return state;
  }

  it("updates the group and notifies", async () => {
    const state = stateWithGroup(7, "Old");
    const { deps, notify } = setup(state);
    const actions = createActions(state, deps);

    await actions.renameGroup(7, "New");

    expect(deps.tabsApi.updateGroup).toHaveBeenCalledWith(7, { title: "New" });
    expect(state.groups.get(7)?.title).toBe("New");
    expect(notify).toHaveBeenCalledWith("Renamed group to “New”.");
  });

  it("is a no-op when the title is unchanged", async () => {
    const state = stateWithGroup(7, "Same");
    const { deps, notify } = setup(state);
    const actions = createActions(state, deps);

    await actions.renameGroup(7, "Same");

    expect(deps.tabsApi.updateGroup).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies and reloads when the rename fails", async () => {
    const state = stateWithGroup(7, "Old");
    const { deps, notify, reload } = setup(state, {
      updateGroup: vi.fn().mockRejectedValue(new Error("nope")),
    });
    const actions = createActions(state, deps);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await actions.renameGroup(7, "New");

    expect(state.groups.get(7)?.title).toBe("Old");
    expect(notify).toHaveBeenCalledWith("Couldn't rename that group.");
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe("groupSelected", () => {
  it("groups the selection and clears it", async () => {
    const state = createState();
    state.tabs = [tab(1), tab(2), tab(3)];
    state.selected = new Set([1, 2]);
    const { deps, notify, reload } = setup(state);
    const actions = createActions(state, deps);

    const result = await actions.groupSelected("Research");

    expect(result.grouped).toBe(true);
    expect(deps.tabsApi.groupTabs).toHaveBeenCalledWith([1, 2]);
    expect(deps.tabsApi.updateGroup).toHaveBeenCalledWith(100, {
      title: "Research",
    });
    expect(state.selected.size).toBe(0);
    expect(notify).toHaveBeenCalledWith("Grouped 2 tabs into “Research”.");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("creates one group per window for a multi-window selection", async () => {
    const state = createState();
    state.tabs = [tab(1, { windowId: 1 }), tab(2, { windowId: 2 })];
    state.selected = new Set([1, 2]);
    const groupTabs = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(200);
    const { deps, notify } = setup(state, { groupTabs });
    const actions = createActions(state, deps);

    const result = await actions.groupSelected("Split");

    expect(result.grouped).toBe(true);
    expect(groupTabs).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(
      "Grouped 2 tabs into “Split” across 2 windows.",
    );
  });

  it("skips pinned tabs and reports the skipped count", async () => {
    const state = createState();
    state.tabs = [tab(1, { pinned: true }), tab(2), tab(3)];
    state.selected = new Set([1, 2, 3]);
    const { deps, notify } = setup(state);
    const actions = createActions(state, deps);

    const result = await actions.groupSelected("");

    expect(result.grouped).toBe(true);
    expect(deps.tabsApi.groupTabs).toHaveBeenCalledWith([2, 3]);
    expect(notify).toHaveBeenCalledWith("Grouped 2 tabs. Skipped 1 pinned tab.");
  });

  it("no-ops and preserves the selection when every selected tab is pinned", async () => {
    const state = createState();
    state.tabs = [tab(1, { pinned: true }), tab(2, { pinned: true })];
    state.selected = new Set([1, 2]);
    const { deps, notify, reload } = setup(state);
    const actions = createActions(state, deps);

    const result = await actions.groupSelected("Nope");

    expect(result.grouped).toBe(false);
    expect(deps.tabsApi.groupTabs).not.toHaveBeenCalled();
    expect(state.selected.size).toBe(2);
    expect(notify).toHaveBeenCalledWith("Pinned tabs can't be grouped.");
    expect(reload).not.toHaveBeenCalled();
  });

  it("notifies, clears selection, and reloads when grouping fails mid-way", async () => {
    const state = createState();
    state.tabs = [tab(1, { windowId: 1 }), tab(2, { windowId: 2 })];
    state.selected = new Set([1, 2]);
    const groupTabs = vi
      .fn()
      .mockResolvedValueOnce(100)
      .mockRejectedValueOnce(new Error("window closed"));
    const { deps, notify, reload } = setup(state, { groupTabs });
    const actions = createActions(state, deps);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.groupSelected("Half");

    expect(result.grouped).toBe(false);
    expect(notify).toHaveBeenCalledWith("Couldn't group those tabs.");
    expect(state.selected.size).toBe(0);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("returns ungrouped for an empty selection", async () => {
    const state = createState();
    const { deps, notify } = setup(state);
    const actions = createActions(state, deps);

    const result = await actions.groupSelected("Anything");

    expect(result.grouped).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
