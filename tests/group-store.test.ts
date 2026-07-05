import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import {
  MAX_REMEMBERED,
  groupKey,
  snapshotOpenGroups,
  syncRemembered,
} from "../src/manager/group-store";
import type { RememberedGroup, Tab, TabGroup } from "../src/manager/state";

function tab(id: number, groupId: number, url?: string): Tab {
  return { id, groupId, url } as Tab;
}

function group(id: number, title: string, color = "blue"): TabGroup {
  return { id, title, color } as TabGroup;
}

function remembered(
  overrides: Partial<RememberedGroup> & { key: string },
): RememberedGroup {
  return {
    title: "",
    color: "blue",
    urls: ["https://example.com/"],
    lastGroupId: 0,
    lastSeen: 0,
    ...overrides,
  };
}

describe("snapshotOpenGroups", () => {
  it("captures each open group's tab urls in order", () => {
    const groups = new Map([
      [7, group(7, "Work")],
      [9, group(9, "Play")],
    ]);
    const tabs = [
      tab(1, 7, "https://a.test/"),
      tab(2, 9, "https://b.test/"),
      tab(3, 7, "https://c.test/"),
      tab(4, -1, "https://ungrouped.test/"),
    ];
    const snaps = snapshotOpenGroups(tabs, groups);
    expect(snaps.map((s) => s.group.id)).toEqual([7, 9]);
    expect(snaps[0]?.urls).toEqual(["https://a.test/", "https://c.test/"]);
    expect(snaps[1]?.urls).toEqual(["https://b.test/"]);
  });

  it("skips groups whose tabs have no urls", () => {
    const groups = new Map([[7, group(7, "Blank")]]);
    const snaps = snapshotOpenGroups([tab(1, 7)], groups);
    expect(snaps).toEqual([]);
  });
});

describe("syncRemembered", () => {
  it("upserts open groups and reports none as notOpen", () => {
    const open = [
      { group: group(7, "Work"), urls: ["https://a.test/"] },
    ];
    const { all, notOpen } = syncRemembered([], open, 100);
    expect(all).toHaveLength(1);
    expect(all[0]?.key).toBe(groupKey("blue", "Work"));
    expect(all[0]?.lastSeen).toBe(100);
    expect(notOpen).toEqual([]);
  });

  it("keeps entries for groups that are no longer open", () => {
    const stored = [remembered({ key: groupKey("blue", "Old"), title: "Old" })];
    const { all, notOpen } = syncRemembered(stored, [], 100);
    expect(all).toHaveLength(1);
    expect(notOpen.map((g) => g.title)).toEqual(["Old"]);
  });

  it("drops the stale entry when an open group was renamed", () => {
    const stored = [
      remembered({
        key: groupKey("blue", "Before"),
        title: "Before",
        lastGroupId: 7,
      }),
    ];
    const open = [{ group: group(7, "After"), urls: ["https://a.test/"] }];
    const { all, notOpen } = syncRemembered(stored, open, 100);
    expect(all.map((g) => g.title)).toEqual(["After"]);
    expect(notOpen).toEqual([]);
  });

  it("updates an existing entry's urls and lastSeen when reopened", () => {
    const key = groupKey("blue", "Work");
    const stored = [
      remembered({ key, title: "Work", urls: ["https://old.test/"] }),
    ];
    const open = [{ group: group(9, "Work"), urls: ["https://new.test/"] }];
    const { all } = syncRemembered(stored, open, 200);
    expect(all).toHaveLength(1);
    expect(all[0]?.urls).toEqual(["https://new.test/"]);
    expect(all[0]?.lastSeen).toBe(200);
    expect(all[0]?.lastGroupId).toBe(9);
  });

  it("caps stored entries at the newest MAX_REMEMBERED", () => {
    const stored = Array.from({ length: MAX_REMEMBERED + 20 }, (_, i) =>
      remembered({ key: `blue:g${i}`, title: `g${i}`, lastSeen: i }),
    );
    const { all } = syncRemembered(stored, [], 1000);
    expect(all).toHaveLength(MAX_REMEMBERED);
    expect(all[0]?.lastSeen).toBe(MAX_REMEMBERED + 19);
  });

  it("never reports an open group as notOpen (fuzz)", () => {
    const arbEntry = fc
      .record({
        color: fc.constantFrom("blue", "red", "green"),
        title: fc.string({ maxLength: 5 }),
        lastGroupId: fc.integer({ min: 1, max: 30 }),
        lastSeen: fc.integer({ min: 0, max: 1000 }),
      })
      .map((r) =>
        remembered({ ...r, key: groupKey(r.color, r.title) }),
      );
    const arbOpen = fc
      .record({
        id: fc.integer({ min: 1, max: 30 }),
        color: fc.constantFrom("blue", "red", "green"),
        title: fc.string({ maxLength: 5 }),
      })
      .map((r) => ({
        group: group(r.id, r.title, r.color),
        urls: ["https://x.test/"],
      }));
    fc.assert(
      fc.property(
        fc.array(arbEntry, { maxLength: 20 }),
        fc.array(arbOpen, { maxLength: 10 }),
        (stored, open) => {
          const { notOpen } = syncRemembered(stored, open, 5000);
          const openKeys = new Set(
            open.map((o) => groupKey(o.group.color, o.group.title ?? "")),
          );
          for (const entry of notOpen) {
            expect(openKeys.has(entry.key)).toBe(false);
          }
        },
      ),
    );
  });
});
