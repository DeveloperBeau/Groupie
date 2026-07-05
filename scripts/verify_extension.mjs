// End-to-end smoke test: load the built extension in Chromium, open tabs, and
// drive the manager UI through the core flows. Run `npm run test:e2e`.
import { launchWithExtension } from "./harness.mjs";

const results = [];
const check = (name, cond) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

const seed = [
  "https://example.com/",
  "https://example.org/",
  "https://example.net/",
  "https://www.iana.org/help/example-domains",
];

const { extId, openManager, cleanup } = await launchWithExtension({
  seedUrls: seed,
});
console.log("extension id:", extId);

const errors = [];
const mgr = await openManager({ onPageError: (e) => errors.push(String(e)) });
await mgr.waitForSelector(".tab-row");

const waitForToast = (expected) =>
  mgr.waitForFunction(
    (want) => document.querySelector("#toast")?.textContent?.includes(want),
    expected,
  );

// --- Rendering ---
const rowCount = await mgr.locator(".tab-row").count();
check("renders tab rows for open tabs", rowCount >= seed.length);

const countText = await mgr.locator("#tab-count").textContent();
check("tab count populated", /\d+ tab/.test(countText));

check(
  "selection bar hidden initially",
  await mgr.locator("#selection-bar").isHidden(),
);

check(
  "saved-groups hint shows before any group is remembered",
  await mgr.locator("#remembered-container .remembered-hint").isVisible(),
);

// --- Selection + select-all ---
// The <input> is visually hidden (styled label), so click the label like a user.
await mgr.locator(".tab-row .checkbox").nth(0).click();
await mgr.locator(".tab-row .checkbox").nth(1).click();
await mgr.waitForSelector("#selection-bar:not([hidden])");
const selText = await mgr.locator("#selection-count").textContent();
check("selection count = 2", selText.trim() === "2 selected");
check(
  "select-all is indeterminate for a partial selection",
  await mgr.locator("#select-all").evaluate((el) => el.indeterminate),
);

await mgr.locator("#selection-bar .checkbox").click();
await mgr.waitForFunction(() => document.querySelector("#select-all")?.checked);
check(
  "select-all selects every tab",
  (await mgr.locator("#selection-count").textContent()).trim() ===
    `${rowCount} selected`,
);

await mgr.locator("#selection-bar .checkbox").click();
check(
  "select-all again clears the selection",
  await mgr.locator("#selection-bar").isHidden(),
);

// --- Grouping ---
await mgr.locator(".tab-row .checkbox").nth(0).click();
await mgr.locator(".tab-row .checkbox").nth(1).click();
await mgr.locator("#new-group-name").fill("Cowork research");
await mgr.locator("#group-btn").click();
const groupNamed = (name) =>
  mgr.waitForFunction(
    (want) =>
      [...document.querySelectorAll(".group-name")].some(
        (i) => i.value === want,
      ),
    name,
  );
await groupNamed("Cowork research");
check("created named group from selection", true);
check(
  "group input cleared after grouping",
  (await mgr.locator("#new-group-name").inputValue()) === "",
);

// --- Per-group and all-groups selection ---
const groupHeadCheckbox = mgr.locator(".group-head .checkbox").first();
await groupHeadCheckbox.click();
await mgr.waitForSelector("#selection-bar:not([hidden])");
check(
  "group header checkbox selects the whole group",
  (await mgr.locator("#selection-count").textContent()).trim() === "2 selected",
);
await groupHeadCheckbox.click();
check(
  "group header checkbox deselects the group",
  await mgr.locator("#selection-bar").isHidden(),
);

await mgr.locator("#select-groups-btn").click();
await mgr.waitForSelector("#selection-bar:not([hidden])");
check(
  "select-all-groups selects every grouped tab",
  (await mgr.locator("#selection-count").textContent()).trim() === "2 selected",
);
check(
  "select-all-groups button flips to deselect",
  (await mgr.locator("#select-groups-btn").textContent()).trim() ===
    "Deselect all groups",
);
await mgr.locator("#select-groups-btn").click();
check(
  "deselect-all-groups clears the selection",
  await mgr.locator("#selection-bar").isHidden(),
);

// --- Rename: commit via Enter ---
const groupName = mgr.locator(".group-name:not([disabled])").first();
await groupName.fill("Renamed group");
await groupName.press("Enter");
await waitForToast("Renamed group to");
await groupNamed("Renamed group");
check("rename via Enter commits", true);

// --- Rename: cancel via Escape ---
await groupName.fill("Should not stick");
await groupName.press("Escape");
check(
  "rename via Escape restores the old name",
  (await groupName.inputValue()) === "Renamed group",
);

// --- Grid view ---
await mgr.evaluate(() => {
  const section = [...document.querySelectorAll(".group")].find((s) => {
    const inp = s.querySelector(".group-name");
    return inp && inp.value === "Renamed group";
  });
  section.querySelector(".group-head-actions .btn").click();
});
await mgr.waitForSelector("#grid-view:not([hidden])");
check(
  "grid view shows tab cards",
  (await mgr.locator(".tab-card").count()) >= 2,
);
check(
  "grid title reflects group name",
  (await mgr.locator("#grid-group-name").textContent()).trim() ===
    "Renamed group",
);

await mgr.locator("#back-btn").click();
await mgr.waitForSelector("#list-view:not([hidden])");
check(
  "back button returns to list",
  await mgr.locator("#grid-view").isHidden(),
);

// --- Pinned tabs are excluded from grouping ---
await mgr.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://example.net/" });
  await chrome.tabs.update(tab.id, { pinned: true });
});
await mgr.waitForSelector(".pin-badge");

const pinnedRow = mgr.locator(".tab-row", { has: mgr.locator(".pin-badge") });
await pinnedRow.locator(".checkbox").click();
const otherRow = mgr
  .locator(".tab-row", { hasNot: mgr.locator(".pin-badge") })
  .last();
await otherRow.locator(".checkbox").click();
await mgr.locator("#new-group-name").fill("Mixed");
await mgr.locator("#group-btn").click();
await waitForToast("Skipped 1 pinned tab");
const pinnedState = await mgr.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://example.net/" });
  return { pinned: tab.pinned, groupId: tab.groupId };
});
check(
  "pinned tab stays pinned and ungrouped",
  pinnedState.pinned && pinnedState.groupId === -1,
);

// --- All-pinned selection is a no-op that preserves state ---
await mgr.waitForSelector("#selection-bar[hidden]", { state: "attached" });
await pinnedRow.locator(".checkbox").click();
await mgr.locator("#new-group-name").fill("Pins");
await mgr.locator("#group-btn").click();
await waitForToast("Pinned tabs can't be grouped.");
check(
  "all-pinned grouping preserves selection",
  (await mgr.locator("#selection-count").textContent()).trim() === "1 selected",
);
check(
  "all-pinned grouping preserves the name input",
  (await mgr.locator("#new-group-name").inputValue()) === "Pins",
);

// --- Saved groups: a closed group is remembered and can be reopened ---
await mgr.evaluate(async () => {
  const [group] = await chrome.tabGroups.query({ title: "Mixed" });
  const tabs = await chrome.tabs.query({ groupId: group.id });
  await chrome.tabs.remove(tabs.map((t) => t.id));
});
await mgr.waitForSelector(".remembered-group");
check(
  "closed group appears under saved groups",
  await mgr.evaluate(() =>
    [...document.querySelectorAll(".remembered-group .group-name-static")].some(
      (el) => el.textContent === "Mixed",
    ),
  ),
);

await mgr.evaluate(() => {
  const section = [...document.querySelectorAll(".remembered-group")].find(
    (s) => s.querySelector(".group-name-static")?.textContent === "Mixed",
  );
  [...section.querySelectorAll("button")]
    .find((b) => b.textContent === "Open group")
    .click();
});
await groupNamed("Mixed");
check("saved group reopens as a live group", true);
await mgr.waitForFunction(
  () => document.querySelectorAll(".remembered-group").length === 0,
);
check("reopened group leaves the saved section", true);

// --- Saved groups: forget removes the entry ---
await mgr.evaluate(async () => {
  const [group] = await chrome.tabGroups.query({ title: "Mixed" });
  const tabs = await chrome.tabs.query({ groupId: group.id });
  await chrome.tabs.remove(tabs.map((t) => t.id));
});
await mgr.waitForSelector(".remembered-group");
await mgr.evaluate(() => {
  const section = [...document.querySelectorAll(".remembered-group")].find(
    (s) => s.querySelector(".group-name-static")?.textContent === "Mixed",
  );
  [...section.querySelectorAll("button")]
    .find((b) => b.textContent === "Forget")
    .click();
});
await mgr.waitForFunction(
  () =>
    ![
      ...document.querySelectorAll(".remembered-group .group-name-static"),
    ].some((el) => el.textContent === "Mixed"),
);
check("forget removes the saved group entry", true);

// --- Delete everything -> empty state ---
const before = await mgr.locator(".tab-row").count();
await mgr.locator("#selection-bar .checkbox").click();
await mgr.locator("#delete-btn").click();
await mgr.waitForFunction(
  (b) => document.querySelectorAll(".tab-row").length < b,
  before,
);
check(
  "delete removes tab rows",
  (await mgr.locator(".tab-row").count()) < before,
);
await mgr.waitForSelector("#empty-state:not([hidden])");
check("empty state appears once every tab is closed", true);

check("no uncaught page errors", errors.length === 0);
if (errors.length) console.log("PAGE ERRORS:", errors);

await cleanup();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
