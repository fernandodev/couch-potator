import { describe, expect, it } from "vitest";
import { orderFrontmatter, parseMarkdown, stringifyMarkdown } from "../src/frontmatter.js";
import { slugify, uniqueId } from "../src/slug.js";

describe("frontmatter", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseMarkdown(`---\nid: a\ntitle: A card\ndepends_on:\n  - b\n---\n\n## Why\n\nBecause.\n`);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.data.id).toBe("a");
    expect(parsed.data.depends_on).toEqual(["b"]);
    expect(parsed.body.trim()).toBe("## Why\n\nBecause.");
  });

  it("treats a file without frontmatter as a body", () => {
    const parsed = parseMarkdown("# Hello\n");
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.data).toEqual({});
    expect(parsed.body).toBe("# Hello\n");
  });

  it("round-trips unknown keys and canonical order", () => {
    const raw = `---\ntitle: T\nweird_key: keep me\nid: t\nkind: fix\n---\n\nBody\n`;
    const parsed = parseMarkdown(raw);
    const out = stringifyMarkdown(parsed.data, parsed.body);
    const again = parseMarkdown(out);
    expect(again.data.weird_key).toBe("keep me");
    expect(Object.keys(again.data)).toEqual(["id", "title", "kind", "weird_key"]);
  });

  it("orders canonical keys before extras", () => {
    const ordered = orderFrontmatter({ zeta: 1, title: "T", id: "i", alpha: 2 });
    expect(Object.keys(ordered)).toEqual(["id", "title", "zeta", "alpha"]);
  });

  it("keeps milestone as a number and dates as strings", () => {
    const out = stringifyMarkdown({ id: "x", milestone: 2, created: "2026-11-16" }, "body");
    const parsed = parseMarkdown(out);
    expect(parsed.data.milestone).toBe(2);
    expect(parsed.data.created).toBe("2026-11-16");
  });
});

describe("slug", () => {
  it("slugifies titles", () => {
    expect(slugify("Reduce cold start!")).toBe("reduce-cold-start");
    expect(slugify("  Héllo, Wörld  ")).toBe("hello-world");
    expect(slugify("***")).toBe("card");
  });

  it("deduplicates ids", () => {
    expect(uniqueId("a", new Set())).toBe("a");
    expect(uniqueId("a", new Set(["a"]))).toBe("a-2");
    expect(uniqueId("a", new Set(["a", "a-2"]))).toBe("a-3");
  });
});
