import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cardsInColumn, findRoot, milestonesOf, resolveCard, scanBoard } from "./helpers.js";
import { UsageError } from "../src/errors.js";

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
    expect(board.cards.map((card) => card.id)).toEqual(["a-card", "b-card", "z-card"]);
    expect(cardsInColumn(board, "todo").map((card) => card.id)).toEqual(["a-card", "b-card"]);
  });

  it("derives status from the folder, not frontmatter", () => {
    write("blocked", "x", "title: X\nstatus: done\nblocked_reason: waiting");
    const board = scanBoard(root);
    expect(board.byId.get("x")?.status).toBe("blocked");
  });

  it("collects milestone registry from the brief and cards", () => {
    write("todo", "a", "title: A\nmilestone: 2");
    const board = scanBoard(root);
    expect(milestonesOf(board)).toEqual([1, 2, 3]);
    expect(board.brief.name).toBe("Demo");
    expect(board.brief.currentMilestone).toBe(1);
  });

  it("warns about a stray folder but keeps parsing", () => {
    write("todo", "a", "title: A");
    mkdirSync(path.join(root, "board", "review"));
    const board = scanBoard(root, { lenient: true });
    expect(board.issues.some((issue) => issue.message.includes("review"))).toBe(true);
    expect(board.cards).toHaveLength(1);
  });

  it("throws on malformed frontmatter unless lenient", () => {
    writeFileSync(
      path.join(root, "board", "todo", "bad.md"),
      `---\ntitle: [unclosed\n---\n\nBody\n`,
    );
    expect(() => scanBoard(root)).toThrow();
    const board = scanBoard(root, { lenient: true });
    expect(board.issues.some((issue) => issue.level === "error")).toBe(true);
  });
});

describe("resolveCard", () => {
  beforeEach(() => {
    write("todo", "reduce-cold-start", "title: Reduce cold start");
    write("todo", "render-checkboxes", "title: Render checkboxes");
  });

  it("resolves exact ids, prefixes and substrings", () => {
    const board = scanBoard(root);
    expect(resolveCard(board, "reduce-cold-start").id).toBe("reduce-cold-start");
    expect(resolveCard(board, "reduce").id).toBe("reduce-cold-start");
    expect(resolveCard(board, "checkbox").id).toBe("render-checkboxes");
  });

  it("rejects ambiguous prefixes", () => {
    const board = scanBoard(root);
    expect(() => resolveCard(board, "re")).toThrow(UsageError);
  });

  it("rejects unknown cards", () => {
    const board = scanBoard(root);
    expect(() => resolveCard(board, "nope")).toThrow(/No card called/);
  });
});

describe("findRoot", () => {
  it("walks up from a nested directory", () => {
    mkdirSync(path.join(root, "board", "todo"), { recursive: true });
    expect(findRoot(path.join(root, "board", "todo"))).toBe(root);
  });

  it("returns null when there is no board", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "cpt-empty-"));
    try {
      expect(findRoot(empty)).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
