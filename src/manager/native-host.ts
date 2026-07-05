// Bridge to the optional Groupie native messaging host, which reads Chrome's
// own saved-groups store (something no extension API can do). Everything here
// is fail-safe: if the host isn't installed, dies, or returns something
// unexpected, the caller gets null and the extension behaves exactly as it
// does without the host.

const HOST_NAME = "com.groupie.saved_groups";

const COLOR_NAMES = new Set([
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
]);

export interface NativeSavedGroup {
  title: string;
  color: `${chrome.tabGroups.Color}`;
  urls: string[];
}

export function validateNativeResponse(
  response: unknown,
): NativeSavedGroup[] | null {
  if (typeof response !== "object" || response === null) return null;
  const r = response as { ok?: unknown; groups?: unknown };
  if (r.ok !== true || !Array.isArray(r.groups)) return null;
  const groups: NativeSavedGroup[] = [];
  for (const entry of r.groups) {
    if (typeof entry !== "object" || entry === null) continue;
    const { title, color, urls } = entry as Record<string, unknown>;
    if (typeof title !== "string" || !Array.isArray(urls)) continue;
    const cleanUrls = urls.filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );
    if (cleanUrls.length === 0) continue;
    // Unnamed groups holding nothing but fresh new-tab pages are transient
    // auto-saved noise, not something worth reopening.
    if (!title && cleanUrls.every((u) => u === "chrome://newtab/")) continue;
    const safeColor =
      typeof color === "string" && COLOR_NAMES.has(color) ? color : "grey";
    groups.push({
      title,
      color: safeColor as `${chrome.tabGroups.Color}`,
      urls: cleanUrls,
    });
  }
  return groups;
}

export async function fetchNativeSavedGroups(): Promise<
  NativeSavedGroup[] | null
> {
  try {
    const response: unknown = await chrome.runtime.sendNativeMessage(
      HOST_NAME,
      { type: "listSavedGroups" },
    );
    return validateNativeResponse(response);
  } catch {
    // Host not installed or crashed: the seeding fallback still works.
    return null;
  }
}
