// Capture the README screenshots from the built extension. Run
// `npm run screenshots`.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { launchWithExtension } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "docs");
fs.mkdirSync(outDir, { recursive: true });

const { openManager, cleanup } = await launchWithExtension({
  seedUrls: [
    "https://example.com/",
    "https://example.org/",
    "https://example.net/",
    "https://www.iana.org/help/example-domains",
    "https://developer.mozilla.org/",
  ],
  viewport: { width: 1100, height: 820 },
});

const mgr = await openManager();
await mgr.waitForSelector(".tab-row");

// Build a named group from the first two tabs to make the shot representative.
await mgr.locator(".tab-row .checkbox").nth(0).click();
await mgr.locator(".tab-row .checkbox").nth(1).click();
await mgr.locator("#new-group-name").fill("Cowork research");
await mgr.locator("#group-btn").click();
await mgr.waitForFunction(() =>
  [...document.querySelectorAll(".group-name")].some(
    (i) => i.value === "Cowork research",
  ),
);
// Let the confirmation toast fade before capturing.
await mgr.waitForSelector("#toast[hidden]", { state: "attached" });
await mgr.screenshot({ path: path.join(outDir, "list-view.png") });

// Grid view of the group.
await mgr.evaluate(() => {
  const section = [...document.querySelectorAll(".group")].find(
    (s) => s.querySelector(".group-name")?.value === "Cowork research",
  );
  section.querySelector(".group-head-actions .btn").click();
});
await mgr.waitForSelector("#grid-view:not([hidden])");
await mgr.screenshot({ path: path.join(outDir, "grid-view.png") });

console.log("wrote docs/list-view.png and docs/grid-view.png");
await cleanup();
