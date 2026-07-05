// Shared Playwright launch helper for the e2e smoke test and screenshot
// script. Loads the built extension from dist/, so run `npm run build` first.
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distPath = path.join(root, "dist");

export async function launchWithExtension({ seedUrls = [], viewport } = {}) {
  if (!fs.existsSync(path.join(distPath, "manifest.json"))) {
    throw new Error("dist/ is missing or unbuilt; run `npm run build` first");
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "groupie-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    // Full Chromium (not the headless shell): MV3 extensions only load in the
    // new headless mode.
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
      "--no-sandbox",
    ],
    ...(viewport ? { viewport } : {}),
  });

  // Wait for the MV3 service worker to learn the extension id.
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = new URL(sw.url()).host;

  for (const url of seedUrls) {
    const page = await ctx.newPage();
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
      .catch(() => {});
  }

  // Drop the context's initial about:blank page so it doesn't pollute the
  // manager's tab list.
  for (const page of ctx.pages()) {
    if (page.url() === "about:blank") await page.close().catch(() => {});
  }

  // onPageError must be attached before navigation so boot-time exceptions
  // are captured too.
  async function openManager({ onPageError } = {}) {
    const page = await ctx.newPage();
    if (onPageError) page.on("pageerror", onPageError);
    await page.goto(`chrome-extension://${extId}/manager.html`);
    return page;
  }

  async function cleanup() {
    await ctx.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  return { ctx, extId, openManager, cleanup };
}
