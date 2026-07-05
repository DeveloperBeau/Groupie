// Install the Groupie native messaging host (macOS):
//   bun scripts/install-native-host.mjs [extension-id]
//
// 1. Compiles native-host/src/main.ts into a self-contained binary at
//    ~/Library/Application Support/Groupie/groupie-native-host
// 2. Writes the host manifest into Chrome's NativeMessagingHosts directory,
//    allowing only the given extension id (default: computed from this
//    repo's dist/ path, matching a "Load unpacked" install of dist/).
//
// Uninstall by deleting both paths printed at the end.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST_NAME = "com.groupie.saved_groups";

// Chrome derives an unpacked extension's id from the SHA-256 of its absolute
// path, hex-mapped onto a-p.
function unpackedExtensionId(absPath) {
  const digest = createHash("sha256").update(absPath, "utf8").digest("hex");
  return [...digest.slice(0, 32)]
    .map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16)))
    .join("");
}

const extensionId =
  process.argv[2] ?? unpackedExtensionId(path.join(root, "dist"));
if (!/^[a-p]{32}$/.test(extensionId)) {
  console.error(`"${extensionId}" doesn't look like an extension id`);
  process.exit(1);
}

const appDir = path.join(os.homedir(), "Library/Application Support/Groupie");
const binaryPath = path.join(appDir, "groupie-native-host");
fs.mkdirSync(appDir, { recursive: true });

console.log("compiling native host...");
execFileSync(
  "bun",
  [
    "build",
    "--compile",
    path.join(root, "native-host/src/main.ts"),
    "--outfile",
    binaryPath,
  ],
  { stdio: "inherit" },
);

const manifestDir = path.join(
  os.homedir(),
  "Library/Application Support/Google/Chrome/NativeMessagingHosts",
);
fs.mkdirSync(manifestDir, { recursive: true });
const manifestPath = path.join(manifestDir, `${HOST_NAME}.json`);
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      name: HOST_NAME,
      description: "Reads Chrome's saved tab groups for Groupie",
      path: binaryPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`],
    },
    null,
    2,
  ) + "\n",
);

console.log(`\ninstalled:
  binary:   ${binaryPath}
  manifest: ${manifestPath}
  allowed:  chrome-extension://${extensionId}/

Restart Chrome (or reload the extension) to pick it up.`);
