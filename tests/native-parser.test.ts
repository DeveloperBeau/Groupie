import { describe, expect, it } from "bun:test";
import {
  parseLog,
  snappyDecompress,
  type Entries,
} from "../native-host/src/leveldb";
import {
  classifyEntity,
  extractSavedGroups,
} from "../native-host/src/saved-groups";

// --- protobuf encoding helpers for fixtures ---

function vint(value: number | bigint): number[] {
  let v = BigInt(value);
  const out: number[] = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
  return out;
}

function fVarint(num: number, value: number | bigint): number[] {
  return [...vint((num << 3) | 0), ...vint(value)];
}

function fBytes(num: number, bytes: number[]): number[] {
  return [...vint((num << 3) | 2), ...vint(bytes.length), ...bytes];
}

function fStr(num: number, s: string): number[] {
  return fBytes(num, [...new TextEncoder().encode(s)]);
}

const GROUP_GUID = "11111111-2222-3333-4444-555555555555";
const TAB_GUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function groupEntity(title: string, color: number, position = 1): Uint8Array {
  const group = [
    ...fStr(2, title),
    ...fVarint(3, color),
    ...fVarint(4, position),
  ];
  const spec = [...fStr(1, GROUP_GUID), ...fBytes(4, group)];
  return new Uint8Array([...fVarint(1, 1), ...fBytes(2, spec)]);
}

function tabEntity(url: string, position: number, guid = TAB_GUID): Uint8Array {
  const tab = [
    ...fStr(1, GROUP_GUID),
    ...fVarint(2, position),
    ...fStr(3, url),
    ...fStr(4, "some title"),
  ];
  const spec = [...fStr(1, guid), ...fBytes(5, tab)];
  return new Uint8Array([...fVarint(1, 1), ...fBytes(2, spec)]);
}

describe("classifyEntity", () => {
  it("decodes a group with an emoji title", () => {
    const entity = classifyEntity(groupEntity("✅ Daily job scan", 8));
    expect(entity).toEqual({
      kind: "group",
      guid: GROUP_GUID,
      title: "✅ Daily job scan",
      color: "cyan",
      position: 1n,
    });
  });

  it("decodes a tab with its group reference", () => {
    const entity = classifyEntity(tabEntity("https://example.com/", 2));
    expect(entity).toEqual({
      kind: "tab",
      groupGuid: GROUP_GUID,
      url: "https://example.com/",
      position: 2n,
    });
  });

  it("maps unknown colors to grey", () => {
    const entity = classifyEntity(groupEntity("g", 99));
    expect(entity?.kind === "group" && entity.color).toBe("grey");
  });

  it("returns null for garbage", () => {
    expect(classifyEntity(new Uint8Array([0xff, 0xff, 0xff]))).toBeNull();
    expect(classifyEntity(new Uint8Array([]))).toBeNull();
    expect(
      classifyEntity(new Uint8Array([...fVarint(1, 1), ...fStr(2, "hi")])),
    ).toBeNull();
  });
});

describe("extractSavedGroups", () => {
  it("assembles groups with their tabs ordered by position", () => {
    const entries: Entries = new Map([
      ["saved_tab_group-dt-g1", groupEntity("Work", 2)],
      [
        "saved_tab_group-dt-t2",
        tabEntity(
          "https://second.test/",
          2,
          "aaaaaaaa-bbbb-cccc-dddd-000000000002",
        ),
      ],
      [
        "saved_tab_group-dt-t1",
        tabEntity(
          "https://first.test/",
          1,
          "aaaaaaaa-bbbb-cccc-dddd-000000000001",
        ),
      ],
      ["unrelated-key", groupEntity("Ignored", 3)],
    ]);
    const groups = extractSavedGroups(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      guid: GROUP_GUID,
      title: "Work",
      color: "blue",
      urls: ["https://first.test/", "https://second.test/"],
    });
  });

  it("drops groups with no tabs", () => {
    const entries: Entries = new Map([
      ["saved_tab_group-dt-g1", groupEntity("Empty", 2)],
    ]);
    expect(extractSavedGroups(entries)).toEqual([]);
  });
});

describe("parseLog", () => {
  function logFile(batch: number[]): Uint8Array {
    // One FULL (type 1) record in a single block: crc(4) + len(2) + type(1).
    const header = [0, 0, 0, 0, batch.length & 0xff, batch.length >> 8, 1];
    return new Uint8Array([...header, ...batch]);
  }

  function batch(ops: Array<{ key: string; value?: string }>): number[] {
    const body: number[] = [];
    for (const op of ops) {
      const key = [...new TextEncoder().encode(op.key)];
      if (op.value !== undefined) {
        const value = [...new TextEncoder().encode(op.value)];
        body.push(
          1,
          ...vint(key.length),
          ...key,
          ...vint(value.length),
          ...value,
        );
      } else {
        body.push(0, ...vint(key.length), ...key);
      }
    }
    // 8-byte sequence + 4-byte count.
    const count = ops.length;
    return [0, 0, 0, 0, 0, 0, 0, 0, count, 0, 0, 0, ...body];
  }

  it("applies puts and deletions in order", () => {
    const into: Entries = new Map();
    parseLog(
      logFile(
        batch([
          { key: "a", value: "1" },
          { key: "b", value: "2" },
        ]),
      ),
      into,
    );
    parseLog(logFile(batch([{ key: "a" }])), into);
    expect([...into.keys()]).toEqual(["b"]);
    expect(new TextDecoder().decode(into.get("b"))).toBe("2");
  });

  it("ignores truncated files without throwing", () => {
    const into: Entries = new Map();
    parseLog(new Uint8Array([1, 2, 3]), into);
    expect(into.size).toBe(0);
  });
});

describe("snappyDecompress", () => {
  it("decodes literals", () => {
    const data = new TextEncoder().encode("hello");
    const compressed = new Uint8Array([5, (5 - 1) << 2, ...data]);
    expect(new TextDecoder().decode(snappyDecompress(compressed))).toBe(
      "hello",
    );
  });

  it("decodes back-reference copies", () => {
    // "abc" literal, then copy offset 3 length 6 -> "abcabcabc"
    const lit = new TextEncoder().encode("abc");
    const copyTag = ((6 - 4) << 2) | 1; // kind 1, offset high bits 0
    const compressed = new Uint8Array([9, (3 - 1) << 2, ...lit, copyTag, 3]);
    expect(new TextDecoder().decode(snappyDecompress(compressed))).toBe(
      "abcabcabc",
    );
  });

  it("rejects bad offsets", () => {
    const compressed = new Uint8Array([4, 0, 65, ((4 - 4) << 2) | 1, 9]);
    expect(() => snappyDecompress(compressed)).toThrow();
  });
});
