import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { UsageError } from "../src/errors.js";
import { cardsInColumn, findRoot, milestonesOf, resolveCard, scanBoard } from "./helpers.js";

let root: string;

const write = (column: string, id: string, frontmatter: string, body = "Body"): void => {
  const dir = path.join(root, "board", column);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-board-"));
  mkdirSync(path.join(root, ".couch-potator"), { recursive: true });
  mkdirSync(path.join(root, "board", "todo"), { recursive: true });
  writeFileSync(path.join(root, ".couch-potator", "config.json"), "{}");
  writeFileSync(
    path.join(root, "PROJECT.md"),
    `---\nname: Demo\ncurrent_milestone: 1\nmilestones: [1, 3]\n---\n\n# Demo\n\nBrief.\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scanBoard", () => {
  it("reads cards from the four columns and sorts them", () => {
    write("todo", "b-card", "title: B");
    write("todo", "a-card", "title: A\norder: 5");
    write("done", "z-card", "title: Z");

    const board = scanBoard(root);
    assert.deepEqual(board.cards.map((card) => card.id), ["a-card", "b-card", "z-card"]);
    assert.deepEqual(cardsInColumn(board, "todo").map((card) => card.id), ["a-card", "b-card"]);
  });

  it("derives status from the folder, not frontmatter", () => {
    write("blocked", "x", "title: X\nstatus: done\nblocked_reason: waiting");
    const board = scanBoard(root);
    assert.equal(board.byId.get("x")?.status, "blocked");
  });

  it("collects milestone registry from the brief and cards", () => {
    write("todo", "a", "title: A\nmilestone: 2");
    const board = scanBoard(root);
    assert.deepEqual(milestonesOf(board), [1, 2, 3]);
    assert.equal(board.brief.name, "Demo");
    assert.equal(board.brief.currentMilestone, 1);
  });

  it("warns about a stray folder but keeps parsing", () => {
    write("todo", "a", "title: A");
    mkdirSync(path.join(root, "board", "review"));
    const board = scanBoard(root, { lenient: true });
    assert.ok(board.issues.some((issue) => issue.message.includes("review")));
    assert.equal(board.cards.length, 1);
  });

  it("throws on malformed frontmatter unless lenient", () => {
    writeFileSync(
      path.join(root, "board", "todo", "bad.md"),
      `---\ntitle: [unclosed\n---\n\nBody\n`,
    );
    assert.throws(() => scanBoard(root));
    const board = scanBoard(root, { lenient: true });
    assert.ok(board.issues.some((issue) => issue.level === "error"));
  });
});

describe("resolveCard", () => {
  beforeEach(() => {
    write("todo", "reduce-cold-start", "title: Reduce cold start");
    write("todo", "render-checkboxes", "title: Render checkboxes");
  });

  it("resolves exact ids, prefixes and substrings", () => {
    const board = scanBoard(root);
    assert.equal(resolveCard(board, "reduce-cold-start").id, "reduce-cold-start");
    assert.equal(resolveCard(board, "reduce").id, "reduce-cold-start");
    assert.equal(resolveCard(board, "checkbox").id, "render-checkboxes");
  });

  it("rejects ambiguous prefixes", () => {
    const board = scanBoard(root);
    assert.throws(() => resolveCard(board, "re"), UsageError);
  });

  it("rejects unknown cards", () => {
    const board = scanBoard(root);
    assert.throws(() => resolveCard(board, "nope"), /No card called/);
  });
});

describe("findRoot", () => {
  it("walks up from a nested directory", () => {
    mkdirSync(path.join(root, "board", "todo"), { recursive: true });
    assert.equal(findRoot(path.join(root, "board", "todo")), root);
  });

  it("returns null when there is no board", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "cpt-empty-"));
    try {
      assert.equal(findRoot(empty), null);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
