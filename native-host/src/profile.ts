// Locate the Chrome profile's saved-groups LevelDB and read it safely: the
// files are copied to a temp directory first so a live Chrome holding the
// LOCK is never disturbed.

import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";
import { readLevelDb, type Entries } from "./leveldb";

export function defaultLevelDbDir(profile = "Default"): string {
  return join(
    homedir(),
    "Library/Application Support/Google/Chrome",
    profile,
    "Sync Data/LevelDB",
  );
}

export async function readSyncLevelDb(dir: string): Promise<Entries> {
  const staging = await mkdtemp(join(tmpdir(), "groupie-ldb-"));
  try {
    const names = (await readdir(dir)).filter(
      (n) => n.endsWith(".ldb") || n.endsWith(".log"),
    );
    for (const name of names) {
      try {
        await copyFile(join(dir, name), join(staging, name));
      } catch {
        // A file rotated away mid-copy; skip it.
      }
    }
    return await readLevelDb(
      staging,
      async (p) => new Uint8Array(await readFile(p)),
      (p) => readdir(p),
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
