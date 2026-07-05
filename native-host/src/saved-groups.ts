// Decode Chrome's saved_tab_group sync entities out of raw LevelDB values.
//
// Observed layout (Chrome ~149) of each `saved_tab_group-dt-<guid>` value:
//
//   f1: format version (varint)
//   f2: SavedTabGroupSpecifics
//       f1: entity guid (string)
//       f2/f3: creation/update timestamps
//       f4: group  { f2: title, f3: color enum, f4: position }
//       f5: tab    { f1: group guid, f2: position, f3: url, f4: title }
//   f3: sync metadata (ignored)
//
// Everything is parsed defensively: any value that doesn't match simply
// yields nothing, so a future Chrome format change degrades to "no groups"
// rather than an error.

import type { Entries } from "./leveldb";

const KEY_PREFIX = "saved_tab_group-dt-";

// Chromium's SavedTabGroupColor enum order (0 = unspecified).
const COLORS = [
  "grey",
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const;

export interface SavedGroup {
  guid: string;
  title: string;
  color: string;
  urls: string[];
}

type Decoded = Map<number, Array<{ varint?: bigint; bytes?: Uint8Array }>>;

function varint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  while (pos < buf.length && shift <= 63n) {
    const b = buf[pos]!;
    pos += 1;
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, pos];
    shift += 7n;
  }
  throw new Error("bad varint");
}

function decodeProto(buf: Uint8Array): Decoded {
  const fields: Decoded = new Map();
  let pos = 0;
  while (pos < buf.length) {
    let tag: bigint;
    [tag, pos] = varint(buf, pos);
    const num = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (num === 0 || num > 10_000) throw new Error("bad field number");
    const list = fields.get(num) ?? [];
    if (wire === 0) {
      let v: bigint;
      [v, pos] = varint(buf, pos);
      list.push({ varint: v });
    } else if (wire === 2) {
      let len: bigint;
      [len, pos] = varint(buf, pos);
      const n = Number(len);
      if (n < 0 || pos + n > buf.length) throw new Error("bad length");
      list.push({ bytes: buf.subarray(pos, pos + n) });
      pos += n;
    } else if (wire === 5) {
      pos += 4;
      list.push({});
    } else if (wire === 1) {
      pos += 8;
      list.push({});
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
    if (pos > buf.length) throw new Error("overrun");
    fields.set(num, list);
  }
  return fields;
}

function str(fields: Decoded, num: number): string | undefined {
  const bytes = fields.get(num)?.[0]?.bytes;
  if (bytes === undefined) return undefined;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function int(fields: Decoded, num: number): bigint | undefined {
  return fields.get(num)?.[0]?.varint;
}

function msg(fields: Decoded, num: number): Decoded | undefined {
  const bytes = fields.get(num)?.[0]?.bytes;
  if (bytes === undefined) return undefined;
  try {
    return decodeProto(bytes);
  } catch {
    return undefined;
  }
}

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface GroupEntity {
  kind: "group";
  guid: string;
  title: string;
  color: string;
  position: bigint;
}

interface TabEntity {
  kind: "tab";
  groupGuid: string;
  url: string;
  position: bigint;
}

export function classifyEntity(
  value: Uint8Array,
): GroupEntity | TabEntity | null {
  let top: Decoded;
  try {
    top = decodeProto(value);
  } catch {
    return null;
  }
  const spec = msg(top, 2);
  if (!spec) return null;
  const guid = str(spec, 1);
  if (!guid || !GUID_RE.test(guid)) return null;

  const group = msg(spec, 4);
  if (group) {
    const colorIdx = Number(int(group, 3) ?? 0n);
    return {
      kind: "group",
      guid,
      title: str(group, 2) ?? "",
      color: COLORS[colorIdx] ?? "grey",
      position: int(group, 4) ?? 0n,
    };
  }

  const tab = msg(spec, 5);
  if (tab) {
    const groupGuid = str(tab, 1);
    const url = str(tab, 3);
    if (!groupGuid || !GUID_RE.test(groupGuid) || !url) return null;
    return {
      kind: "tab",
      groupGuid,
      url,
      position: int(tab, 2) ?? 0n,
    };
  }
  return null;
}

export function extractSavedGroups(entries: Entries): SavedGroup[] {
  const groups: Array<GroupEntity & { urls: string[] }> = [];
  const byGuid = new Map<string, GroupEntity & { urls: string[] }>();
  const tabs: TabEntity[] = [];
  for (const [key, value] of entries) {
    if (!key.startsWith(KEY_PREFIX)) continue;
    const entity = classifyEntity(value);
    if (!entity) continue;
    if (entity.kind === "group") {
      const withUrls = { ...entity, urls: [] as string[] };
      groups.push(withUrls);
      byGuid.set(entity.guid, withUrls);
    } else {
      tabs.push(entity);
    }
  }
  tabs.sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  for (const tab of tabs) {
    byGuid.get(tab.groupGuid)?.urls.push(tab.url);
  }
  groups.sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  return groups
    .filter((g) => g.urls.length > 0)
    .map(({ guid, title, color, urls }) => ({ guid, title, color, urls }));
}
