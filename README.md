# Groupie

Groupie is a Chrome tab group manager. Claude Cowork opens way too many tabs
and never cleans up after itself, so Groupie gives you one screen to see every
open tab, close the ones you don't need, bundle the rest into named groups,
and jump into a grid view of any group.

![List view](docs/list-view.png)

## Features (V1)

- **See everything.** One page lists all open tabs across every window,
  organized by their Chrome tab group (plus an _Ungrouped_ section).
- **Select one or many.** Per-tab checkboxes, plus a _select all_ toggle.
- **Delete.** Close the selected tabs in a single click (or the `✕` on any row).
- **Group and rename.** Drop the selected tabs into a new named group, and
  rename any existing group inline (click its name, type, press Enter).
- **Show tabs in group.** Open any group in a grid view; click a tile to jump
  straight to that tab, or `✕` to close it.
- **Live.** The manager refreshes as tabs open, close, and move.
- **Saved groups.** Groupie remembers every group it has seen open (Chrome
  gives extensions no way to read its own saved-groups store), lists the ones
  not open in this session, and can reopen or forget them.

![Grid view](docs/grid-view.png)

## Install (load unpacked)

Groupie is a Manifest V3 extension written in TypeScript and built with
[Bun](https://bun.sh):

```bash
bun install
bun run build
```

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this repository's `dist/` folder
   (not the repository root).
4. Pin the Groupie icon, then click it to open the tab manager.

## Usage

- Click the toolbar icon to open (or re-focus) the **Groupie** manager tab.
- Tick tabs to select them. A toolbar appears with:
  - a **New group name** field + **Group selected** button, and
  - a **Delete** button.
- To rename a group, click its title in the list, edit, and press **Enter**
  (**Esc** cancels).
- Click **Show tabs in group** on any group to open its grid; **Back** returns
  to the list.

> Note: Chrome only groups tabs within a single window. If your selection spans
> multiple windows, Groupie creates one group per window and gives them all the
> same name.

## Project layout

| Path                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `manifest.json`                | MV3 manifest (permissions: `tabs`, `tabGroups`, `favicon`).      |
| `src/background.ts`            | Service worker; opens/focuses the manager tab on icon click.     |
| `src/manager/`                 | Manager page modules: state, actions, Chrome adapter, renderers. |
| `manager.html` / `manager.css` | The manager page shell and styles.                               |
| `icons/`                       | Toolbar/store icons (generated).                                 |
| `scripts/`                     | Build, icon generation, e2e test, and screenshot helpers.        |
| `tests/`                       | Unit tests (`bun test`), including fuzz cases via fast-check.    |
| `dist/`                        | Build output; this is the folder Chrome loads.                   |

## Development

Everything runs through Bun scripts:

```bash
bun run build        # bundle src/ + copy static assets into dist/
bun run watch        # rebuild on change
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun test             # unit tests (with fast-check fuzzing)
bun run test:e2e     # build, then drive the extension in Chromium via Playwright
bun run screenshots  # regenerate the README screenshots
bun run icons        # regenerate the PNG icons (python3)
```

The e2e test needs Playwright's Chromium once:

```bash
bunx playwright install chromium
```

CI (GitHub Actions) runs lint, format check, typecheck, unit tests, the build,
and the e2e smoke test on every pull request.

## Seeing Chrome's saved groups (optional native helper)

Chrome gives extensions no API for saved-but-inactive tab groups (tracked in
[w3c/webextensions#715](https://github.com/w3c/webextensions/issues/715)).
Without help, Groupie only remembers groups it has seen open. The optional
native messaging helper closes that gap by reading the saved-groups store in
your Chrome profile (`Sync Data/LevelDB`) and listing every saved group, shown
with a "from Chrome" badge:

```bash
bun scripts/install-native-host.mjs   # pass an extension id to override the default
```

The installer compiles a self-contained binary to
`~/Library/Application Support/Groupie/groupie-native-host` and registers it in
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. Delete
those two paths to uninstall. Notes:

- macOS-only as written; the profile defaults to `Default` (create
  `~/Library/Application Support/Groupie/config.json` with `{"profile": "..."}`
  to override).
- This reads undocumented Chrome internals; a future Chrome version may change
  the format. Groupie degrades gracefully: if the helper is missing or returns
  nothing, the seeding behavior still works.
- Profiles with a sync passphrase encrypt this data; the helper will simply
  find no groups.
