// "Saved groups" section: Chrome's own saved groups (when the optional
// native host is installed) plus groups Groupie has snapshotted itself,
// excluding anything currently open.

import type { DisplayedSavedGroup } from "../group-store";
import { hostSummary, tabCountLabel } from "../format";
import { colorHex } from "./shared";

export interface RememberedHandlers {
  reopenGroup(group: DisplayedSavedGroup): void;
  forgetGroup(group: DisplayedSavedGroup): void;
}

export function renderRemembered(
  container: HTMLElement,
  saved: DisplayedSavedGroup[],
  handlers: RememberedHandlers,
): void {
  container.textContent = "";
  container.hidden = false;

  const label = document.createElement("h2");
  label.className = "section-label";
  label.textContent = "Saved groups (not open)";
  container.appendChild(label);

  if (saved.length === 0) {
    const hint = document.createElement("p");
    hint.className = "remembered-hint";
    hint.textContent =
      "Chrome doesn't let extensions read its saved tab groups. Open a " +
      "saved group once (click its chip in Chrome's tab strip) and Groupie " +
      "will remember it here — or install the optional native helper " +
      "(see the README) to list all of Chrome's saved groups automatically.";
    container.appendChild(hint);
    return;
  }

  for (const group of saved) {
    container.appendChild(renderSavedGroup(group, handlers));
  }
}

function renderSavedGroup(
  group: DisplayedSavedGroup,
  handlers: RememberedHandlers,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "group remembered-group";

  const head = document.createElement("div");
  head.className = "group-head";

  const dot = document.createElement("span");
  dot.className = "group-dot";
  dot.style.background = colorHex(group.color);
  head.appendChild(dot);

  const name = document.createElement("span");
  name.className = "group-name-static";
  name.textContent = group.title || "Unnamed group";
  head.appendChild(name);

  const meta = document.createElement("span");
  meta.className = "group-meta";
  meta.textContent = tabCountLabel(group.urls.length);
  head.appendChild(meta);

  // Groups often share a name and color; the hosts tell them apart.
  const hosts = document.createElement("span");
  hosts.className = "group-meta remembered-hosts";
  hosts.textContent = hostSummary(group.urls);
  hosts.title = group.urls.join("\n");
  head.appendChild(hosts);

  if (group.source === "chrome") {
    const badge = document.createElement("span");
    badge.className = "source-badge";
    badge.textContent = "from Chrome";
    badge.title = "Read from Chrome's saved-groups store by the native helper";
    head.appendChild(badge);
  }

  const actions = document.createElement("div");
  actions.className = "group-head-actions";

  const openBtn = document.createElement("button");
  openBtn.className = "btn btn-ghost";
  openBtn.textContent = "Open group";
  openBtn.addEventListener("click", () => handlers.reopenGroup(group));
  actions.appendChild(openBtn);

  if (group.source === "groupie") {
    const forgetBtn = document.createElement("button");
    forgetBtn.className = "btn btn-ghost";
    forgetBtn.textContent = "Forget";
    forgetBtn.title = "Remove from Groupie's saved groups";
    forgetBtn.addEventListener("click", () => handlers.forgetGroup(group));
    actions.appendChild(forgetBtn);
  }

  head.appendChild(actions);
  section.appendChild(head);
  return section;
}
