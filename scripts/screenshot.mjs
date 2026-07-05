// Capture screenshots of the Groupie manager for the README / review.
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(__dirname, "..");
const outDir = path.resolve(__dirname, "..", "docs");
fs.mkdirSync(outDir, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "groupie-shot-"));

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-sandbox",
  ],
  viewport: { width: 1100, height: 820 },
});

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;

const seed = [
  "https://example.com/",
  "https://example.org/",
  "https://example.net/",
  "https://www.iana.org/help/example-domains",
  "https://developer.mozilla.org/",
];
for (const url of seed) {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
}

const mgr = await ctx.newPage();
await mgr.setViewportSize({ width: 1100, height: 820 });
await mgr.goto(`chrome-extension://${extId}/manager.html`);
await mgr.waitForSelector(".tab-row");

// Build a named group from the first two tabs to make the shot representative.
await mgr.locator(".tab-row .checkbox").nth(0).click();
await mgr.locator(".tab-row .checkbox").nth(1).click();
await mgr.locator("#new-group-name").fill("Cowork research");
await mgr.locator("#group-btn").click();
await mgr.waitForFunction(() =>
  [...document.querySelectorAll(".group-name")].some((i) => i.value === "Cowork research")
);
await mgr.screenshot({ path: path.join(outDir, "list-view.png") });

// Grid view of the group.
await mgr.evaluate(() => {
  const s = [...document.querySelectorAll(".group")].find(
    (x) => x.querySelector(".group-name")?.value === "Cowork research"
  );
  s.querySelector(".group-head-actions .btn").click();
});
await mgr.waitForSelector("#grid-view:not([hidden])");
await mgr.screenshot({ path: path.join(outDir, "grid-view.png") });

console.log("wrote docs/list-view.png and docs/grid-view.png");
await ctx.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
