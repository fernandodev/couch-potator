import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderFrontmatter, parseMarkdown, stringifyMarkdown } from "../src/frontmatter.js";
import { slugify, uniqueId } from "../src/slug.js";

describe("frontmatter", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseMarkdown(
      `---\nid: a\ntitle: A card\ndepends_on:\n  - b\n---\n\n## Why\n\nBecause.\n`,
    );
    assert.equal(parsed.hasFrontmatter, true);
    assert.equal(parsed.data.id, "a");
    assert.deepEqual(parsed.data.depends_on, ["b"]);
    assert.equal(parsed.body.trim(), "## Why\n\nBecause.");
  });

  it("treats a file without frontmatter as a body", () => {
    const parsed = parseMarkdown("# Hello\n");
    assert.equal(parsed.hasFrontmatter, false);
    assert.deepEqual(parsed.data, {});
    assert.equal(parsed.body, "# Hello\n");
  });

  it("round-trips unknown keys and canonical order", () => {
    const raw = `---\ntitle: T\nweird_key: keep me\nid: t\nkind: fix\n---\n\nBody\n`;
    const parsed = parseMarkdown(raw);
    const out = stringifyMarkdown(parsed.data, parsed.body);
    const again = parseMarkdown(out);
    assert.equal(again.data.weird_key, "keep me");
    assert.deepEqual(Object.keys(again.data), ["id", "title", "kind", "weird_key"]);
  });

  it("orders canonical keys before extras", () => {
    const ordered = orderFrontmatter({ zeta: 1, title: "T", id: "i", alpha: 2 });
    assert.deepEqual(Object.keys(ordered), ["id", "title", "zeta", "alpha"]);
  });

  it("keeps milestone as a number and dates as strings", () => {
    const out = stringifyMarkdown({ id: "x", milestone: 2, created: "2026-11-16" }, "body");
    const parsed = parseMarkdown(out);
    assert.equal(parsed.data.milestone, 2);
    assert.equal(parsed.data.created, "2026-11-16");
  });
});

describe("slug", () => {
  it("slugifies titles", () => {
    assert.equal(slugify("Reduce cold start!"), "reduce-cold-start");
    assert.equal(slugify("  Héllo, Wörld  "), "hello-world");
    assert.equal(slugify("***"), "card");
  });

  it("deduplicates ids", () => {
    assert.equal(uniqueId("a", new Set()), "a");
    assert.equal(uniqueId("a", new Set(["a"])), "a-2");
    assert.equal(uniqueId("a", new Set(["a", "a-2"])), "a-3");
  });
});
