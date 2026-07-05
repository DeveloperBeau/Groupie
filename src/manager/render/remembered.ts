// "Saved groups" section: groups Groupie has seen open that aren't open in
// this session. Chrome has no API for its own saved-group store, so these
// come from Groupie's snapshots in chrome.storage.local.

import type { RememberedGroup } from "../state";
import { tabCountLabel } from "../format";
import { colorHex } from "./shared";

export interface RememberedHandlers {
  reopenGroup(group: RememberedGroup): void;
  forgetGroup(group: RememberedGroup): void;
}

export function renderRemembered(
  container: HTMLElement,
  remembered: RememberedGroup[],
  handlers: RememberedHandlers,
): void {
  container.textContent = "";
  container.hidden = false;

  const label = document.createElement("h2");
  label.className = "section-label";
  label.textContent = "Saved groups (not open)";
  container.appendChild(label);

  if (remembered.length === 0) {
    const hint = document.createElement("p");
    hint.className = "remembered-hint";
    hint.textContent =
      "Chrome doesn't let extensions read its saved tab groups, so Groupie " +
      "can't see groups that haven't been open since it was installed. Open " +
      "a saved group once (click its chip in Chrome's tab strip) and Groupie " +
      "will remember it here, ready to reopen any time.";
    container.appendChild(hint);
    return;
  }

  for (const group of remembered) {
    container.appendChild(renderRememberedGroup(group, handlers));
  }
}

function renderRememberedGroup(
  group: RememberedGroup,
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

  const actions = document.createElement("div");
  actions.className = "group-head-actions";

  const openBtn = document.createElement("button");
  openBtn.className = "btn btn-ghost";
  openBtn.textContent = "Open group";
  openBtn.addEventListener("click", () => handlers.reopenGroup(group));
  actions.appendChild(openBtn);

  const forgetBtn = document.createElement("button");
  forgetBtn.className = "btn btn-ghost";
  forgetBtn.textContent = "Forget";
  forgetBtn.title = "Remove from Groupie's saved groups";
  forgetBtn.addEventListener("click", () => handlers.forgetGroup(group));
  actions.appendChild(forgetBtn);

  head.appendChild(actions);
  section.appendChild(head);
  return section;
}
