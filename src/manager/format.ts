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

// Compact "where do these urls go" summary, e.g. "github.com, seek.com.au +2".
export function hostSummary(urls: string[], max = 3): string {
  const hosts: string[] = [];
  for (const url of urls) {
    let host: string;
    try {
      host = new URL(url).hostname || url;
    } catch {
      host = url;
    }
    if (host && !hosts.includes(host)) hosts.push(host);
  }
  const shown = hosts.slice(0, max).join(", ");
  const extra = hosts.length - max;
  return extra > 0 ? `${shown} +${extra}` : shown;
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
