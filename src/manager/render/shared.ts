// DOM builders and helpers shared by the list and grid views.

import { buildFaviconUrl } from "../format";
import { TAB_GROUP_ID_NONE } from "../state";
import type { TabGroup } from "../state";

// Chrome tab-group color names -> display hex.
const GROUP_COLORS: Record<string, string> = {
  grey: "#5f6368",
  blue: "#8ab4f8",
  red: "#f28b82",
  yellow: "#fdd663",
  green: "#81c995",
  pink: "#ff8bcb",
  purple: "#c58af9",
  cyan: "#78d9ec",
  orange: "#fcad70",
};

// Neutral globe fallback for tabs whose favicon can't be resolved.
export const FALLBACK_FAVICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="%236b7488" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
  );

export function groupColor(
  groupId: number,
  group: TabGroup | undefined,
): string {
  if (groupId === TAB_GROUP_ID_NONE) return "var(--text-faint)";
  return (group?.color && GROUP_COLORS[group.color]) || "var(--text-faint)";
}

export function createFavicon(
  tab: chrome.tabs.Tab,
  className: string,
): HTMLImageElement {
  const favicon = document.createElement("img");
  favicon.className = className;
  favicon.src =
    buildFaviconUrl(chrome.runtime.getURL("/_favicon/"), tab.url) ??
    FALLBACK_FAVICON;
  favicon.addEventListener("error", () => {
    favicon.src = FALLBACK_FAVICON;
  });
  return favicon;
}

export function createCloseButton(
  className: string,
  onClose: () => void,
): HTMLButtonElement {
  const close = document.createElement("button");
  close.className = className;
  close.textContent = "✕";
  close.title = "Close tab";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });
  return close;
}

export function createToaster(el: HTMLElement): (message: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (message) => {
    el.textContent = message;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  };
}
