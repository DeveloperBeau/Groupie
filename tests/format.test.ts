import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildFaviconUrl,
  prettyUrl,
  tabCountLabel,
} from "../src/manager/format";

describe("prettyUrl", () => {
  it("returns empty string for missing url", () => {
    expect(prettyUrl(undefined)).toBe("");
    expect(prettyUrl("")).toBe("");
  });

  it("drops the scheme and a bare root path", () => {
    expect(prettyUrl("https://example.com/")).toBe("example.com");
  });

  it("keeps non-root paths", () => {
    expect(prettyUrl("https://example.com/a/b?q=1#frag")).toBe(
      "example.com/a/b",
    );
  });

  it("returns invalid urls unchanged", () => {
    expect(prettyUrl("not a url")).toBe("not a url");
  });

  it("never throws and always returns a string (fuzz)", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(typeof prettyUrl(input)).toBe("string");
      }),
    );
  });

  it("contains the hostname for any valid web url (fuzz)", () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        expect(prettyUrl(url)).toContain(new URL(url).hostname);
      }),
    );
  });
});

describe("tabCountLabel", () => {
  it("singularizes exactly one", () => {
    expect(tabCountLabel(1)).toBe("1 tab");
  });

  it("pluralizes zero and many", () => {
    expect(tabCountLabel(0)).toBe("0 tabs");
    expect(tabCountLabel(12)).toBe("12 tabs");
  });
});

describe("buildFaviconUrl", () => {
  const base = "chrome-extension://abc/_favicon/";

  it("returns null without a page url", () => {
    expect(buildFaviconUrl(base, undefined)).toBeNull();
    expect(buildFaviconUrl(base, "")).toBeNull();
  });

  it("encodes query strings, fragments, and ampersands", () => {
    const page = "https://example.com/search?q=a&b=c#frag";
    const result = buildFaviconUrl(base, page);
    expect(result).not.toBeNull();
    const parsed = new URL(result ?? "");
    expect(parsed.searchParams.get("pageUrl")).toBe(page);
    expect(parsed.searchParams.get("size")).toBe("32");
  });

  it("round-trips any web url through pageUrl (fuzz)", () => {
    fc.assert(
      fc.property(fc.webUrl({ withQueryParameters: true }), (page) => {
        const result = buildFaviconUrl(base, page);
        expect(new URL(result ?? "").searchParams.get("pageUrl")).toBe(page);
      }),
    );
  });
});
