// Groupie native messaging host. Speaks Chrome's native messaging protocol
// (4-byte little-endian length prefix + JSON) on stdio and answers
// listSavedGroups requests by reading the profile's sync LevelDB.
//
// Every failure path returns { ok: false } instead of crashing: the
// extension treats any non-ok response as "feature unavailable".

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultLevelDbDir, readSyncLevelDb } from "./profile";
import { extractSavedGroups } from "./saved-groups";

const CONFIG_PATH = join(
  homedir(),
  "Library/Application Support/Groupie/config.json",
);

async function levelDbDir(): Promise<string> {
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, "utf8")) as {
      profile?: string;
      leveldbDir?: string;
    };
    if (config.leveldbDir) return config.leveldbDir;
    if (config.profile) return defaultLevelDbDir(config.profile);
  } catch {
    // No config: use the default profile.
  }
  return defaultLevelDbDir();
}

function respond(message: object): void {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([length, json]));
}

async function handle(request: unknown): Promise<void> {
  const type =
    typeof request === "object" && request !== null
      ? (request as { type?: unknown }).type
      : undefined;
  if (type !== "listSavedGroups") {
    respond({ ok: false, error: "unknown request type" });
    return;
  }
  try {
    const entries = await readSyncLevelDb(await levelDbDir());
    respond({ ok: true, groups: extractSavedGroups(entries) });
  } catch (err) {
    respond({ ok: false, error: String(err) });
  }
}

let buffer = Buffer.alloc(0);
// Requests are handled sequentially; stdin closing must not kill the
// process before queued responses are written.
let pending: Promise<void> = Promise.resolve();
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > 1_000_000) process.exit(1);
    if (buffer.length < 4 + length) return;
    const body = buffer.subarray(4, 4 + length);
    buffer = Buffer.from(buffer.subarray(4 + length));
    let request: unknown;
    try {
      request = JSON.parse(body.toString("utf8"));
    } catch {
      respond({ ok: false, error: "bad json" });
      continue;
    }
    pending = pending.then(() => handle(request));
  }
});
process.stdin.on("end", () => {
  void pending.then(() => process.exit(0));
});
