import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { scanBoard } from "../src/board.js";
import { addCommand } from "../src/commands/add.js";
import { bodyCommand } from "../src/commands/body.js";
import { checkCommand } from "../src/commands/check.js";
import { initCommand } from "../src/commands/init.js";
import { linkCommand } from "../src/commands/link.js";
import { listCommand } from "../src/commands/list.js";
import { moveCommand } from "../src/commands/move.js";
import { rmCommand } from "../src/commands/rm.js";
import { setCommand } from "../src/commands/set.js";
import { showCommand } from "../src/commands/show.js";
import { viewCommand } from "../src/commands/view.js";
import { parseMarkdown } from "../src/frontmatter.js";
import { captureOutput, type OutputCapture } from "./support.js";

let root: string;
let output: OutputCapture;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-cmd-"));
  output = captureOutput();
  await initCommand(["--root", root, "--name", "Demo"]);
});

afterEach(() => {
  output.restore();
  rmSync(root, { recursive: true, force: true });
});

const cardPath = (column: string, id: string): string =>
  path.join(root, "board", column, `${id}.md`);

describe("init", () => {
  it("creates the board, config, brief and agent files", () => {
    assert.equal(existsSync(path.join(root, "board", "todo")), true);
    assert.equal(existsSync(path.join(root, "board", "in-progress")), true);
    assert.equal(existsSync(path.join(root, "board", "blocked")), true);
    assert.equal(existsSync(path.join(root, "board", "done")), true);
    assert.equal(existsSync(path.join(root, ".couch-potator", "config.json")), true);
    assert.equal(existsSync(path.join(root, "PROJECT.md")), true);
    assert.equal(existsSync(path.join(root, "AGENTS.md")), true);
    assert.equal(
      existsSync(path.join(root, ".opencode", "skills", "couch-potator-board", "SKILL.md")),
      true,
    );
    assert.equal(
      existsSync(path.join(root, ".opencode", "skills", "couch-potator-planner", "SKILL.md")),
      true,
    );
    assert.ok(readFileSync(path.join(root, ".gitignore"), "utf8").includes(".couch-potator/viewer/"));

    const brief = parseMarkdown(readFileSync(path.join(root, "PROJECT.md"), "utf8"));
    assert.equal(brief.data.name, "Demo");
    assert.equal(brief.data.current_milestone, 1);
    assert.ok(brief.body.includes("## Vision"));
    assert.ok(brief.body.includes("## Working state"));
    assert.ok(brief.body.includes("## Ideas / later"));
  });

  it("names the skills after the tool and their folders", () => {
    for (const name of ["couch-potator-board", "couch-potator-planner"]) {
      const skill = parseMarkdown(
        readFileSync(path.join(root, ".opencode", "skills", name, "SKILL.md"), "utf8"),
      );
      assert.equal(skill.data.name, name);
      assert.match(String(skill.data.description), /couch-potator/);
    }
  });

  it("makes the planner the planning law and points at the question tool", () => {
    const planner = readFileSync(
      path.join(root, ".opencode", "skills", "couch-potator-planner", "SKILL.md"),
      "utf8",
    );
    assert.match(planner, /You are the \*\*planner\*\*/);
    assert.match(planner, /question/);
    assert.match(planner, /Is this milestone enough/);
    assert.match(planner, /couch-potator add/);
    assert.match(planner, /couch-potator body/);
    assert.match(planner, /couch-potator check/);
  });

  it("removes the legacy board skill", async () => {
    const legacy = path.join(root, ".opencode", "skills", "board", "SKILL.md");
    mkdirSync(path.dirname(legacy), { recursive: true });
    writeFileSync(legacy, "---\nname: Board Viewer\ndescription: old\n---\n\n# Board\n", "utf8");

    await initCommand(["--root", root]);

    assert.equal(existsSync(path.dirname(legacy)), false);
    assert.equal(
      existsSync(path.join(root, ".opencode", "skills", "couch-potator-board", "SKILL.md")),
      true,
    );
  });

  it("is idempotent and keeps an existing brief", async () => {
    await initCommand(["--root", root, "--name", "Renamed"]);
    const brief = parseMarkdown(readFileSync(path.join(root, "PROJECT.md"), "utf8"));
    assert.equal(brief.data.name, "Demo");
  });

  it("can skip the agent scaffolding", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-noskill-"));
    try {
      await initCommand(["--root", other, "--no-skill"]);
      assert.equal(existsSync(path.join(other, ".opencode")), false);
      assert.equal(existsSync(path.join(other, "AGENTS.md")), false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("add", () => {
  it("writes a card with the full frontmatter", async () => {
    await addCommand([
      "--root",
      root,
      "Reduce cold start",
      "-k",
      "feature",
      "-m",
      "2",
      "-p",
      "high",
    ]);
    const parsed = parseMarkdown(readFileSync(cardPath("todo", "reduce-cold-start"), "utf8"));
    assert.equal(parsed.data.title, "Reduce cold start");
    assert.equal(parsed.data.kind, "feature");
    assert.equal(parsed.data.milestone, 2);
    assert.equal(parsed.data.priority, "high");
    assert.equal(parsed.data.order, 10);
    assert.ok(parsed.body.includes("## User story"));
    assert.ok(parsed.body.includes("## Acceptance criteria"));
    assert.ok(parsed.body.includes("## Out of scope"));
  });

  it("records surfaces, splitting comma-separated values", async () => {
    await addCommand([
      "--root",
      root,
      "Change the board",
      "-s",
      "board-screen",
      "-s",
      "card-panel,search",
    ]);
    const board = scanBoard(root);
    assert.deepEqual(board.byId.get("change-the-board")?.surfaces, [
      "board-screen",
      "card-panel",
      "search",
    ]);
  });

  it("uses the project card template for new bodies", async () => {
    writeFileSync(
      path.join(root, ".couch-potator", "templates", "card.md"),
      "## Custom\n\nA custom body.\n",
      "utf8",
    );
    await addCommand(["--root", root, "Templated"]);
    const parsed = parseMarkdown(readFileSync(cardPath("todo", "templated"), "utf8"));
    assert.ok(parsed.body.includes("A custom body."));
  });

  it("deduplicates ids and appends to the column", async () => {
    await addCommand(["--root", root, "Same title"]);
    await addCommand(["--root", root, "Same title"]);
    const board = scanBoard(root);
    assert.deepEqual(
      board.cards.map((card) => card.id).sort(),
      ["same-title", "same-title-2"],
    );
    assert.equal(
      board.cards.every((card) => card.order === 10 || card.order === 20),
      true,
    );
  });

  it("accepts column aliases", async () => {
    await addCommand(["--root", root, "Doing now", "-c", "wip"]);
    assert.equal(existsSync(cardPath("in-progress", "doing-now")), true);
  });

  it("rejects a missing title", async () => {
    await assert.rejects(addCommand(["--root", root]), /title/);
  });

  it("warns but records forward dependencies", async () => {
    await addCommand(["--root", root, "Depends early", "-d", "not-yet"]);
    const board = scanBoard(root);
    assert.deepEqual(board.byId.get("depends-early")?.dependsOn, ["not-yet"]);
  });
});

describe("list and show", () => {
  it("filters by column and milestone", async () => {
    await addCommand(["--root", root, "One", "-m", "1"]);
    await addCommand(["--root", root, "Two", "-m", "2", "-c", "done"]);

    output.clear();
    await listCommand(["--root", root, "-m", "2", "--ids"]);
    assert.equal(output.logs.join("\n").trim(), "two");
  });

  it("prints raw markdown with --raw", async () => {
    await addCommand(["--root", root, "Raw card"]);
    output.clear();
    await showCommand(["--root", root, "raw-card", "--raw"]);
    assert.ok(output.logs.join("").includes("title: Raw card"));
  });

  it("exposes surfaces in JSON and in the plain spec", async () => {
    await addCommand(["--root", root, "Visible change", "-s", "board-screen,card-panel"]);

    output.clear();
    await showCommand(["--root", root, "visible-change", "--json"]);
    const json = JSON.parse(output.logs.join(""));
    assert.deepEqual(json.surfaces, ["board-screen", "card-panel"]);

    output.clear();
    await showCommand(["--root", root, "visible-change"]);
    assert.match(output.logs.join(""), /surfaces\s+board-screen, card-panel/);
  });
});

describe("body", () => {
  it("replaces a card body and keeps the frontmatter", async () => {
    await addCommand(["--root", root, "Replace me", "-k", "feature", "-m", "2"]);
    const file = path.join(root, "body.md");
    writeFileSync(file, "## Summary\n\nA new body.\n", "utf8");

    await bodyCommand(["--root", root, "replace-me", "--file", file]);

    const parsed = parseMarkdown(readFileSync(cardPath("todo", "replace-me"), "utf8"));
    assert.equal(parsed.data.title, "Replace me");
    assert.equal(parsed.data.milestone, 2);
    assert.ok(parsed.body.includes("A new body."));
    assert.ok(!parsed.body.includes("Acceptance criteria"));
  });

  it("requires a card and a file", async () => {
    await assert.rejects(bodyCommand(["--root", root, "missing"]), /needs a card and a file/);
  });
});

describe("move", () => {
  it("moves the file and renumbers both columns", async () => {
    await addCommand(["--root", root, "First"]);
    await addCommand(["--root", root, "Second"]);
    await addCommand(["--root", root, "Third"]);

    await moveCommand(["--root", root, "second", "in-progress"]);
    assert.equal(existsSync(cardPath("todo", "second")), false);
    assert.equal(existsSync(cardPath("in-progress", "second")), true);

    const board = scanBoard(root);
    assert.equal(board.byId.get("first")?.order, 10);
    assert.equal(board.byId.get("third")?.order, 20);
    assert.equal(board.byId.get("second")?.status, "in-progress");
  });

  it("supports --top, --before and --after", async () => {
    await addCommand(["--root", root, "Alpha"]);
    await addCommand(["--root", root, "Beta"]);
    await addCommand(["--root", root, "Gamma"]);

    await moveCommand(["--root", root, "gamma", "in-progress"]);
    await moveCommand(["--root", root, "gamma", "todo", "--top"]);

    const board = scanBoard(root);
    const todo = board.cards.filter((card) => card.status === "todo").map((card) => card.id);
    assert.deepEqual(todo, ["gamma", "alpha", "beta"]);
  });

  it("rejects an unknown column", async () => {
    await addCommand(["--root", root, "Card"]);
    await assert.rejects(moveCommand(["--root", root, "card", "review"]), /Unknown column/);
  });
});

describe("set", () => {
  it("sets and clears fields", async () => {
    await addCommand(["--root", root, "Card"]);
    await setCommand(["--root", root, "card", "blocked_reason", "waiting", "on", "review"]);
    await setCommand(["--root", root, "card", "milestone", "3"]);

    let board = scanBoard(root);
    assert.equal(board.byId.get("card")?.blockedReason, "waiting on review");
    assert.equal(board.byId.get("card")?.milestone, 3);

    await setCommand(["--root", root, "card", "blocked_reason", "-"]);
    board = scanBoard(root);
    assert.equal(board.byId.get("card")?.blockedReason, null);
  });

  it("sets and clears surfaces", async () => {
    await addCommand(["--root", root, "Card"]);
    await setCommand(["--root", root, "card", "surfaces", "board-screen, card-panel"]);

    let board = scanBoard(root);
    assert.deepEqual(board.byId.get("card")?.surfaces, ["board-screen", "card-panel"]);

    await setCommand(["--root", root, "card", "surfaces", "-"]);
    board = scanBoard(root);
    assert.deepEqual(board.byId.get("card")?.surfaces, []);
  });

  it("rejects unknown kinds", async () => {
    await addCommand(["--root", root, "Card"]);
    await assert.rejects(setCommand(["--root", root, "card", "kind", "nope"]), /Unknown kind/);
  });
});

describe("links", () => {
  it("adds and removes dependencies", async () => {
    await addCommand(["--root", root, "Base"]);
    await addCommand(["--root", root, "Top"]);
    await linkCommand(["--root", root, "add", "top", "base"], "dep");

    let board = scanBoard(root);
    assert.deepEqual(board.byId.get("top")?.dependsOn, ["base"]);

    await linkCommand(["--root", root, "rm", "top", "base"], "dep");
    board = scanBoard(root);
    assert.deepEqual(board.byId.get("top")?.dependsOn, []);
  });

  it("refuses to create a cycle and leaves the file untouched", async () => {
    await addCommand(["--root", root, "A"]);
    await addCommand(["--root", root, "B"]);
    await linkCommand(["--root", root, "add", "b", "a"], "dep");

    await assert.rejects(linkCommand(["--root", root, "add", "a", "b"], "dep"), /cycle/);
    const board = scanBoard(root);
    assert.deepEqual(board.byId.get("a")?.dependsOn, []);
  });

  it("records related links without cycle checks", async () => {
    await addCommand(["--root", root, "A"]);
    await addCommand(["--root", root, "B"]);
    await linkCommand(["--root", root, "add", "a", "b"], "rel");
    await linkCommand(["--root", root, "add", "b", "a"], "rel");

    const board = scanBoard(root);
    assert.deepEqual(board.byId.get("a")?.related, ["b"]);
    assert.deepEqual(board.byId.get("b")?.related, ["a"]);
  });
});

describe("rm", () => {
  it("deletes with --force", async () => {
    await addCommand(["--root", root, "Gone"]);
    await rmCommand(["--root", root, "gone", "--force"]);
    assert.equal(existsSync(cardPath("todo", "gone")), false);
  });

  it("refuses without confirmation when not a tty", async () => {
    await addCommand(["--root", root, "Gone"]);
    await assert.rejects(rmCommand(["--root", root, "gone"]), /without confirmation/);
  });
});

describe("check", () => {
  it("exits 0 on a clean board", async () => {
    await addCommand(["--root", root, "Clean"]);
    assert.equal(await checkCommand(["--root", root]), 0);
  });

  it("exits 1 on a dangling dependency", async () => {
    await addCommand(["--root", root, "Broken", "-d", "ghost"]);
    assert.equal(await checkCommand(["--root", root]), 1);
  });

  it("exits 1 on warnings with --strict", async () => {
    await addCommand(["--root", root, "Category", "-k", "weird"]);
    assert.equal(await checkCommand(["--root", root]), 0);
    assert.equal(await checkCommand(["--root", root, "--strict"]), 1);
  });
});

describe("view", () => {
  it("writes a self-contained page", async () => {
    await addCommand(["--root", root, "Visible card", "-m", "1", "-s", "board-screen"]);
    await viewCommand(["--root", root, "--no-open"]);

    const file = path.join(root, ".couch-potator", "viewer", "board.html");
    assert.equal(existsSync(file), true);
    const html = readFileSync(file, "utf8");
    assert.ok(html.includes('id="board-data"'));
    assert.ok(html.includes("Visible card"));
    assert.ok(html.includes("board-screen"));
    assert.ok(!html.includes("COUCH_POTATOR"));
    assert.ok(!html.includes("/api/state"));
    assert.ok(html.includes("read only"));
  });
});
