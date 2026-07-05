import { describe, expect, it } from "bun:test";
import { validateNativeResponse } from "../src/manager/native-host";
import { groupKey, mergeSavedGroups } from "../src/manager/group-store";
import type { RememberedGroup, TabGroup } from "../src/manager/state";

describe("validateNativeResponse", () => {
  const good = {
    ok: true,
    groups: [{ title: "Work", color: "blue", urls: ["https://a.test/"] }],
  };

  it("accepts a well-formed response", () => {
    expect(validateNativeResponse(good)).toEqual([
      { title: "Work", color: "blue", urls: ["https://a.test/"] },
    ]);
  });

  it("rejects non-objects, failures, and missing groups", () => {
    expect(validateNativeResponse(null)).toBeNull();
    expect(validateNativeResponse("nope")).toBeNull();
    expect(validateNativeResponse({ ok: false, error: "x" })).toBeNull();
    expect(validateNativeResponse({ ok: true, groups: "bad" })).toBeNull();
  });

  it("filters malformed entries instead of failing the whole response", () => {
    const groups = validateNativeResponse({
      ok: true,
      groups: [
        good.groups[0],
        null,
        { title: 42, color: "blue", urls: ["https://x.test/"] },
        { title: "No urls", color: "blue", urls: [] },
        { title: "Bad urls", color: "blue", urls: [7] },
      ],
    });
    expect(groups).toEqual([
      { title: "Work", color: "blue", urls: ["https://a.test/"] },
    ]);
  });

  it("normalizes unknown colors to grey", () => {
    const groups = validateNativeResponse({
      ok: true,
      groups: [{ title: "t", color: "vermilion", urls: ["https://a.test/"] }],
    });
    expect(groups?.[0]?.color).toBe("grey");
  });

  it("drops untitled all-new-tab noise groups", () => {
    const groups = validateNativeResponse({
      ok: true,
      groups: [
        {
          title: "",
          color: "grey",
          urls: ["chrome://newtab/", "chrome://newtab/"],
        },
        { title: "", color: "grey", urls: ["https://real.test/"] },
      ],
    });
    expect(groups).toEqual([
      { title: "", color: "grey", urls: ["https://real.test/"] },
    ]);
  });
});

describe("mergeSavedGroups", () => {
  const urls = ["https://a.test/"];
  const native = [{ title: "Work", color: "blue" as const, urls }];

  function rememberedEntry(title: string, tabUrls: string[]): RememberedGroup {
    return {
      key: groupKey("blue", title, tabUrls),
      title,
      color: "blue",
      urls: tabUrls,
      lastGroupId: 1,
      lastSeen: 0,
    };
  }

  it("prefers the native entry over a matching snapshot", () => {
    const merged = mergeSavedGroups(
      native,
      [rememberedEntry("Work", urls)],
      [],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("chrome");
  });

  it("excludes groups that are currently open", () => {
    const open = [
      { group: { id: 1, title: "Work", color: "blue" } as TabGroup, urls },
    ];
    expect(mergeSavedGroups(native, [], open)).toEqual([]);
  });

  it("keeps distinct snapshot entries alongside native ones", () => {
    const other = rememberedEntry("Other", ["https://b.test/"]);
    const merged = mergeSavedGroups(native, [other], []);
    expect(merged.map((g) => [g.title, g.source])).toEqual([
      ["Work", "chrome"],
      ["Other", "groupie"],
    ]);
  });

  it("works without the native host (null)", () => {
    const merged = mergeSavedGroups(null, [rememberedEntry("Work", urls)], []);
    expect(merged.map((g) => g.source)).toEqual(["groupie"]);
  });
});
