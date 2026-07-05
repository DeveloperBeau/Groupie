import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  TAB_GROUP_ID_NONE,
  bucketByGroup,
  orderedGroupIds,
  pruneSelection,
  type Tab,
  type TabGroup,
} from "../src/manager/state";

function tab(id: number, groupId: number = TAB_GROUP_ID_NONE): Tab {
  return { id, groupId } as Tab;
}

function group(id: number, title = ""): TabGroup {
  return { id, title, color: "blue" } as TabGroup;
}

const arbitraryTabs = fc.array(
  fc.record({
    id: fc.integer({ min: 1, max: 10_000 }),
    groupId: fc.oneof(
      fc.constant(TAB_GROUP_ID_NONE),
      fc.integer({ min: 1, max: 5 }),
    ),
  }),
);

describe("bucketByGroup", () => {
  it("buckets tabs by group id preserving order", () => {
    const tabs = [tab(1, 7), tab(2), tab(3, 7), tab(4, 9)];
    const buckets = bucketByGroup(tabs);
    expect(buckets.get(7)?.map((t) => t.id)).toEqual([1, 3]);
    expect(buckets.get(9)?.map((t) => t.id)).toEqual([4]);
    expect(buckets.get(TAB_GROUP_ID_NONE)?.map((t) => t.id)).toEqual([2]);
  });

  it("preserves every tab exactly once, in order (fuzz)", () => {
    fc.assert(
      fc.property(arbitraryTabs, (raw) => {
        const tabs = raw.map((r) => tab(r.id, r.groupId));
        const buckets = bucketByGroup(tabs);
        const total = [...buckets.values()].reduce(
          (sum, bucket) => sum + bucket.length,
          0,
        );
        expect(total).toBe(tabs.length);
        for (const [gid, bucket] of buckets) {
          const expected = tabs.filter((t) => (t.groupId ?? -1) === gid);
          expect(bucket).toEqual(expected);
        }
      }),
    );
  });
});

describe("orderedGroupIds", () => {
  it("orders real groups as Chrome reports them, ungrouped last", () => {
    const groups = new Map([
      [7, group(7)],
      [9, group(9)],
      [11, group(11)],
    ]);
    const buckets = bucketByGroup([tab(1, 9), tab(2), tab(3, 7)]);
    expect(orderedGroupIds(groups, buckets)).toEqual([7, 9, TAB_GROUP_ID_NONE]);
  });

  it("omits groups with no tabs", () => {
    const groups = new Map([[7, group(7)]]);
    const buckets = bucketByGroup([tab(1, 9)]);
    expect(orderedGroupIds(groups, buckets)).toEqual([]);
  });
});

describe("pruneSelection", () => {
  it("drops ids for tabs that no longer exist", () => {
    const selected = new Set([1, 2, 3]);
    pruneSelection(selected, [tab(2)]);
    expect([...selected]).toEqual([2]);
  });

  it("keeps the selection a subset of live tabs (fuzz)", () => {
    fc.assert(
      fc.property(
        arbitraryTabs,
        fc.array(fc.integer({ min: 1, max: 10_000 })),
        (raw, selectedIds) => {
          const tabs = raw.map((r) => tab(r.id, r.groupId));
          const selected = new Set(selectedIds);
          pruneSelection(selected, tabs);
          const liveIds = new Set(tabs.map((t) => t.id));
          for (const id of selected) {
            expect(liveIds.has(id)).toBe(true);
          }
        },
      ),
    );
  });
});
