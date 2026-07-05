// Persistence for groups Groupie has seen open. The pure sync logic is
// separated from the chrome.storage IO so it can be unit tested.

import type { RememberedGroup, Tab, TabGroup } from "./state";
import { bucketByGroup } from "./state";

const STORAGE_KEY = "rememberedGroups";
export const MAX_REMEMBERED = 100;

// FNV-1a 32-bit over the sorted url list, so the fingerprint is stable when
// tabs merely reorder.
function urlFingerprint(urls: string[]): string {
  const input = [...urls].sort().join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// Group ids are session-scoped, so remembered entries are keyed by color +
// title + a fingerprint of their tab urls. The fingerprint keeps groups that
// share a name and color (common with automated naming) from overwriting
// each other.
export function groupKey(color: string, title: string, urls: string[]): string {
  return `${color}:${title}:${urlFingerprint(urls)}`;
}

export interface OpenGroupSnapshot {
  group: TabGroup;
  urls: string[];
}

export function snapshotOpenGroups(
  tabs: Tab[],
  groups: Map<number, TabGroup>,
): OpenGroupSnapshot[] {
  const buckets = bucketByGroup(tabs);
  const snapshots: OpenGroupSnapshot[] = [];
  for (const [gid, group] of groups) {
    const urls = (buckets.get(gid) ?? []).flatMap((t) =>
      t.url ? [t.url] : [],
    );
    if (urls.length > 0) snapshots.push({ group, urls });
  }
  return snapshots;
}

export interface SyncResult {
  all: RememberedGroup[];
  notOpen: RememberedGroup[];
}

// Fold the currently open groups into the stored list. Entries for groups
// that were renamed or recolored while open (same session-scoped group id,
// different key) are dropped so they don't linger as ghosts. Entries are
// capped at MAX_REMEMBERED, newest first.
export function syncRemembered(
  stored: RememberedGroup[],
  open: OpenGroupSnapshot[],
  now: number,
): SyncResult {
  const openKeyById = new Map<number, string>();
  const openKeys = new Set<string>();
  for (const { group, urls } of open) {
    const key = groupKey(group.color, group.title ?? "", urls);
    openKeyById.set(group.id, key);
    openKeys.add(key);
  }

  const byKey = new Map<string, RememberedGroup>();
  for (const entry of stored) {
    const currentKey = openKeyById.get(entry.lastGroupId);
    if (currentKey !== undefined && currentKey !== entry.key) continue;
    byKey.set(entry.key, entry);
  }

  for (const { group, urls } of open) {
    const key = groupKey(group.color, group.title ?? "", urls);
    byKey.set(key, {
      key,
      title: group.title ?? "",
      color: group.color,
      urls,
      lastGroupId: group.id,
      lastSeen: now,
    });
  }

  const all = [...byKey.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, MAX_REMEMBERED);
  const notOpen = all.filter((g) => !openKeys.has(g.key));
  return { all, notOpen };
}

export async function loadRemembered(): Promise<RememberedGroup[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const value: unknown = data[STORAGE_KEY];
  return Array.isArray(value) ? (value as RememberedGroup[]) : [];
}

export async function saveRemembered(groups: RememberedGroup[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: groups });
}

export async function forgetRemembered(key: string): Promise<void> {
  const stored = await loadRemembered();
  await saveRemembered(stored.filter((g) => g.key !== key));
}
