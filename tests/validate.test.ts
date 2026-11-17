import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { scanBoard } from "../src/board.js";
import { findCycles, validateBoard } from "../src/validate.js";

let root: string;

const write = (column: string, id: string, frontmatter: string): void => {
  const dir = path.join(root, "board", column);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.md`), `---\n${frontmatter}\n---\n\nBody\n`);
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-validate-"));
  mkdirSync(path.join(root, ".couch-potator"), { recursive: true });
  writeFileSync(path.join(root, ".couch-potator", "config.json"), "{}");
  writeFileSync(
    path.join(root, "PROJECT.md"),
    `---\nname: Demo\ncurrent_milestone: 1\nmilestones: [1]\n---\n\n# Demo\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findCycles", () => {
  it("finds a three-node cycle", () => {
    write("todo", "a", "title: A\ndepends_on: [c]");
    write("todo", "b", "title: B\ndepends_on: [a]");
    write("todo", "c", "title: C\ndepends_on: [b]");
    const board = scanBoard(root);
    const cycles = findCycles(board.cards);
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0]?.length, 4);
  });

  it("finds nothing on a diamond", () => {
    write("todo", "base", "title: Base");
    write("todo", "left", "title: Left\ndepends_on: [base]");
    write("todo", "right", "title: Right\ndepends_on: [base]");
    write("todo", "top", "title: Top\ndepends_on: [left, right]");
    const board = scanBoard(root);
    assert.deepEqual(findCycles(board.cards), []);
  });
});

describe("validateBoard", () => {
  it("accepts a clean board", () => {
    write("todo", "a", "title: A\nmilestone: 1");
    write("in-progress", "b", "title: B\ndepends_on: [a]");
    const issues = validateBoard(scanBoard(root));
    assert.deepEqual(
      issues.filter((issue) => issue.level === "error"),
      [],
    );
  });

  it("flags missing dependencies and self-dependencies", () => {
    write("todo", "a", "title: A\ndepends_on: [ghost, a]");
    const issues = validateBoard(scanBoard(root));
    const errors = issues.filter((issue) => issue.level === "error").map((issue) => issue.message);
    assert.ok(errors.some((message) => message.includes('depends_on "ghost"')));
    assert.ok(errors.some((message) => message.includes("itself")));
  });

  it("flags duplicate ids across columns", () => {
    write("todo", "same", "title: One");
    write("done", "same", "title: Two");
    const errors = validateBoard(scanBoard(root))
      .filter((issue) => issue.level === "error")
      .map((issue) => issue.message);
    assert.ok(errors.some((message) => message.includes('Duplicate card id "same"')));
  });

  it("flags a frontmatter id that disagrees with the file name", () => {
    write("todo", "file-name", "id: other-name\ntitle: T");
    const errors = validateBoard(scanBoard(root))
      .filter((issue) => issue.level === "error")
      .map((issue) => issue.message);
    assert.ok(errors.some((message) => message.includes("does not match the file name")));
  });

  it("warns instead of failing on soft problems", () => {
    write("todo", "a", "title: A\nkind: made-up");
    write("blocked", "b", "title: B\nmilestone: soon");
    const warnings = validateBoard(scanBoard(root))
      .filter((issue) => issue.level === "warning")
      .map((issue) => issue.message);
    assert.ok(warnings.some((message) => message.includes("Unknown kind")));
    assert.ok(warnings.some((message) => message.includes("not a whole number")));
    assert.ok(warnings.some((message) => message.includes("no blocked_reason")));
  });

  it("warns when two in-progress cards share a surface", () => {
    write("in-progress", "left", "title: Left\nsurfaces: [board-screen]");
    write("in-progress", "right", "title: Right\nsurfaces: [board-screen, search]");
    const warnings = validateBoard(scanBoard(root))
      .filter((issue) => issue.level === "warning")
      .map((issue) => issue.message);
    assert.ok(
      warnings.some((message) =>
        message.includes('in-progress cards "left" and "right" share surface "board-screen"'),
      ),
    );
  });

  it("does not warn when the shared surface is not in progress", () => {
    write("todo", "left", "title: Left\nsurfaces: [board-screen]");
    write("todo", "right", "title: Right\nsurfaces: [board-screen]");
    const warnings = validateBoard(scanBoard(root))
      .filter((issue) => issue.level === "warning")
      .map((issue) => issue.message);
    assert.ok(!warnings.some((message) => message.includes("share surface")));
  });

  it("warns when current_milestone has no cards", () => {
    writeFileSync(
      path.join(root, "PROJECT.md"),
      `---\nname: Demo\ncurrent_milestone: 9\nmilestones: [1]\n---\n\n# Demo\n`,
    );
    write("todo", "a", "title: A");
    const warnings = validateBoard(scanBoard(root))
      .filter((issue) => issue.level === "warning")
      .map((issue) => issue.message);
    assert.ok(warnings.some((message) => message.includes("current_milestone 9")));
  });
});
