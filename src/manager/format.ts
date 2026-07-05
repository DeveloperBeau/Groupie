// Pure formatting helpers, unit-tested without a browser.

export function prettyUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

export function tabCountLabel(count: number): string {
  return `${count} tab${count === 1 ? "" : "s"}`;
}

// Builds a Chrome _favicon lookup URL. `base` is the extension's /_favicon/
// endpoint (injected so this stays pure); returns null when the tab has no URL
// so callers can fall back to the placeholder icon.
export function buildFaviconUrl(
  base: string,
  pageUrl: string | undefined,
  size = 32,
): string | null {
  if (!pageUrl) return null;
  const url = new URL(base);
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}
