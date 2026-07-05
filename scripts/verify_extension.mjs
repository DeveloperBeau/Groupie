// End-to-end smoke test: load Groupie as an unpacked extension in Chromium,
// open some tabs, drive the manager UI, and assert core V1 flows work.
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(__dirname, "..");
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "groupie-"));

const results = [];
const check = (name, cond) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-sandbox",
  ],
});

// Wait for the MV3 service worker to register so we can learn the extension id.
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;
console.log("extension id:", extId);

// Open a few real tabs for the manager to show.
const seed = [
  "https://example.com/",
  "https://example.org/",
  "https://example.net/",
];
for (const url of seed) {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
}

// Open the manager page.
const mgr = await ctx.newPage();
await mgr.goto(`chrome-extension://${extId}/manager.html`);
await mgr.waitForSelector(".tab-row");

const errors = [];
mgr.on("pageerror", (e) => errors.push(String(e)));

// --- Assertions ---
const rowCount = await mgr.locator(".tab-row").count();
check("renders tab rows for open tabs", rowCount >= seed.length);

const countText = await mgr.locator("#tab-count").textContent();
check("tab count populated", /\d+ tab/.test(countText));

// Selection bar hidden until something is selected.
check(
  "selection bar hidden initially",
  await mgr.locator("#selection-bar").isHidden()
);

// Select two tabs -> selection bar appears with correct count.
// The <input> is visually hidden (styled label), so click the label like a user.
await mgr.locator(".tab-row .checkbox").nth(0).click();
await mgr.locator(".tab-row .checkbox").nth(1).click();
await mgr.waitForSelector("#selection-bar:not([hidden])");
const selText = await mgr.locator("#selection-count").textContent();
check("selection count = 2", selText.trim() === "2 selected");

// Group the two selected tabs with a name.
await mgr.locator("#new-group-name").fill("Cowork research");
await mgr.locator("#group-btn").click();
await mgr.waitForFunction(() =>
  [...document.querySelectorAll(".group-name")].some(
    (i) => i.value === "Cowork research"
  )
);
check(
  "created named group from selection",
  await mgr.evaluate(() =>
    [...document.querySelectorAll(".group-name")].some(
      (i) => i.value === "Cowork research"
    )
  )
);

// "Show tabs in group" -> grid view. Group name lives in an input value, so
// find the matching section and click its button directly.
await mgr.evaluate(() => {
  const section = [...document.querySelectorAll(".group")].find((s) => {
    const inp = s.querySelector(".group-name");
    return inp && inp.value === "Cowork research";
  });
  section.querySelector(".group-head-actions .btn").click();
});
await mgr.waitForSelector("#grid-view:not([hidden])");
const cardCount = await mgr.locator(".tab-card").count();
check("grid view shows tab cards", cardCount >= 2);
check(
  "grid title reflects group name",
  (await mgr.locator("#grid-group-name").textContent()).trim() ===
    "Cowork research"
);

// Back to list.
await mgr.locator("#back-btn").click();
await mgr.waitForSelector("#list-view:not([hidden])");
check("back button returns to list", await mgr.locator("#grid-view").isHidden());

// Delete: select a tab and delete it, expect fewer rows.
const before = await mgr.locator(".tab-row").count();
await mgr.locator(".tab-row .checkbox").first().click();
await mgr.locator("#delete-btn").click();
await mgr.waitForFunction(
  (b) => document.querySelectorAll(".tab-row").length < b,
  before
);
const after = await mgr.locator(".tab-row").count();
check("delete removes tab row", after < before);

check("no uncaught page errors", errors.length === 0);
if (errors.length) console.log("PAGE ERRORS:", errors);

await ctx.close();
fs.rmSync(userDataDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
