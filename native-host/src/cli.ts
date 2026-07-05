// Debug CLI: print the saved tab groups found in a Chrome profile.
// Usage: bun native-host/src/cli.ts [profile-name-or-leveldb-path]

import { defaultLevelDbDir, readSyncLevelDb } from "./profile";
import { extractSavedGroups } from "./saved-groups";

const arg = process.argv[2];
const dir = arg?.includes("/") ? arg : defaultLevelDbDir(arg ?? "Default");
const entries = await readSyncLevelDb(dir);
const keys = [...entries.keys()].filter((k) =>
  k.startsWith("saved_tab_group-dt-"),
);
console.log(
  `leveldb entries: ${entries.size}, saved_tab_group: ${keys.length}`,
);
for (const group of extractSavedGroups(entries)) {
  console.log(`\n[${group.color}] ${group.title} (${group.urls.length} tabs)`);
  for (const url of group.urls) console.log(`   ${url.slice(0, 90)}`);
}
