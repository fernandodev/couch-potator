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
import { skillCommand } from "../src/commands/skill.js";
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
    const config = JSON.parse(readFileSync(path.join(root, ".couch-potator", "config.json"), "utf8"));
    assert.deepEqual(config.environments, {});
    assert.equal("default_environment" in config, false);
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
    assert.equal(
      existsSync(path.join(root, ".opencode", "skills", "couch-potator-unblock", "SKILL.md")),
      true,
    );
    assert.equal(existsSync(path.join(root, ".opencode", "commands", "unblock.md")), true);
    assert.equal(
      existsSync(path.join(root, ".opencode", "skills", "couch-potator-implement", "SKILL.md")),
      true,
    );
    assert.equal(existsSync(path.join(root, ".opencode", "commands", "implement.md")), true);
    assert.equal(
      existsSync(path.join(root, ".opencode", "agents", "couch-potator-implementer.md")),
      true,
    );
    assert.equal(
      existsSync(path.join(root, ".opencode", "agents", "couch-potator-integrator.md")),
      true,
    );
    assert.ok(readFileSync(path.join(root, ".gitignore"), "utf8").includes(".couch-potator/viewer/"));
    assert.ok(
      readFileSync(path.join(root, ".gitignore"), "utf8").includes(".couch-potator/worktrees/"),
    );
    assert.ok(
      readFileSync(path.join(root, ".gitignore"), "utf8").includes(".couch-potator/evidence/"),
    );

    const brief = parseMarkdown(readFileSync(path.join(root, "PROJECT.md"), "utf8"));
    assert.equal(brief.data.name, "Demo");
    assert.equal(brief.data.current_milestone, 1);
    assert.ok(brief.body.includes("## Vision"));
    assert.ok(brief.body.includes("## Run and verify"));
    assert.ok(brief.body.includes("## Working state"));
    assert.ok(brief.body.includes("## Ideas / later"));
  });

  it("names the skills after the tool and their folders", () => {
    for (const name of [
      "couch-potator-board",
      "couch-potator-planner",
      "couch-potator-unblock",
      "couch-potator-implement",
    ]) {
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
    assert.match(planner, /environments/);
    assert.match(planner, /Run and verify/);
  });

  it("hides the unblock skill and points /unblock at it", () => {
    const unblock = parseMarkdown(
      readFileSync(
        path.join(root, ".opencode", "skills", "couch-potator-unblock", "SKILL.md"),
        "utf8",
      ),
    );
    assert.equal(unblock.data.name, "couch-potator-unblock");
    assert.deepEqual(unblock.data.metadata, { "opencode/autoinvoke": false });
    assert.match(unblock.body, /## Decision needed/);
    assert.match(unblock.body, /Definition of Ready/);

    const command = readFileSync(
      path.join(root, ".opencode", "commands", "unblock.md"),
      "utf8",
    );
    assert.match(command, /\$ARGUMENTS/);
    assert.match(command, /Load the `couch-potator-unblock` skill/);

    const planner = readFileSync(
      path.join(root, ".opencode", "skills", "couch-potator-planner", "SKILL.md"),
      "utf8",
    );
    assert.match(planner, /Load the `couch-potator-unblock` skill/);
  });

  it("hides the implement skill and installs its command and subagents", () => {
    const skill = parseMarkdown(
      readFileSync(
        path.join(root, ".opencode", "skills", "couch-potator-implement", "SKILL.md"),
        "utf8",
      ),
    );
    assert.equal(skill.data.name, "couch-potator-implement");
    assert.deepEqual(skill.data.metadata, { "opencode/autoinvoke": false });
    assert.match(skill.body, /couch-potator next/);
    assert.match(skill.body, /couch-potator checks/);
    assert.match(skill.body, /spec\/<card-id>/);
    assert.match(skill.body, /STATUS: DONE/);
    assert.match(skill.body, /### 3d\. Work and witness/);
    assert.match(skill.body, /### 3e\. Safety/);
    assert.match(skill.body, /pkill/);
    assert.match(skill.body, /frontmost/);
    assert.match(skill.body, /\$TMPDIR/);
    assert.match(skill.body, /preview\//);
    assert.match(skill.body, /concurrency/);

    const command = readFileSync(path.join(root, ".opencode", "commands", "implement.md"), "utf8");
    assert.match(command, /\$ARGUMENTS/);
    assert.match(command, /Load the `couch-potator-implement` skill/);
    assert.match(command, /--parallel/);

    const implementer = parseMarkdown(
      readFileSync(path.join(root, ".opencode", "agents", "couch-potator-implementer.md"), "utf8"),
    );
    assert.equal(implementer.data.mode, "subagent");
    assert.match(implementer.body, /STATUS: DONE/);
    assert.match(implementer.body, /STATUS: BLOCKED/);
    assert.match(implementer.body, /pending witness/);
    assert.match(implementer.body, /One commit/);
    assert.match(implementer.body, /## Safety/);
    assert.match(implementer.body, /pkill/);
    assert.match(implementer.body, /frontmost/);
    assert.match(implementer.body, /\$TMPDIR/);

    const integrator = parseMarkdown(
      readFileSync(path.join(root, ".opencode", "agents", "couch-potator-integrator.md"), "utf8"),
    );
    assert.equal(integrator.data.mode, "subagent");
    assert.match(integrator.body, /STATUS: REBASED/);
    assert.match(integrator.body, /STATUS: PRODUCT CONFLICT/);
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

  it("installs Claude Code skills, commands, subagents and CLAUDE.md", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-claude-"));
    try {
      await initCommand(["--root", other, "--name", "Demo", "--target", "claude"]);

      for (const name of [
        "couch-potator-board",
        "couch-potator-planner",
        "couch-potator-unblock",
        "couch-potator-implement",
      ]) {
        assert.equal(
          existsSync(path.join(other, ".claude", "skills", name, "SKILL.md")),
          true,
          name,
        );
      }
      assert.equal(existsSync(path.join(other, ".claude", "commands", "unblock.md")), true);
      assert.equal(existsSync(path.join(other, ".claude", "commands", "implement.md")), true);
      assert.equal(
        existsSync(path.join(other, ".claude", "agents", "couch-potator-implementer.md")),
        true,
      );
      assert.equal(
        existsSync(path.join(other, ".claude", "agents", "couch-potator-integrator.md")),
        true,
      );

      assert.equal(existsSync(path.join(other, ".opencode")), false);
      assert.equal(existsSync(path.join(other, "AGENTS.md")), false);
      assert.match(
        readFileSync(path.join(other, "CLAUDE.md"), "utf8"),
        /<!-- couch-potator:start -->/,
      );

      const unblock = parseMarkdown(
        readFileSync(
          path.join(other, ".claude", "skills", "couch-potator-unblock", "SKILL.md"),
          "utf8",
        ),
      );
      assert.equal(unblock.data["disable-model-invocation"], true);
      assert.equal(unblock.data.metadata, undefined);

      const implementer = parseMarkdown(
        readFileSync(
          path.join(other, ".claude", "agents", "couch-potator-implementer.md"),
          "utf8",
        ),
      );
      assert.equal(implementer.data.name, "couch-potator-implementer");
      assert.equal(implementer.data.mode, undefined);

      const planner = readFileSync(
        path.join(other, ".claude", "skills", "couch-potator-planner", "SKILL.md"),
        "utf8",
      );
      assert.match(planner, /AskUserQuestion/);
      assert.match(planner, /multiSelect/);

      const implement = readFileSync(
        path.join(other, ".claude", "skills", "couch-potator-implement", "SKILL.md"),
        "utf8",
      );
      assert.match(implement, /Agent\(subagent_type="couch-potator-implementer"/);
      assert.match(implement, /general-purpose/);
      assert.match(implement, /<worktree>\/CLAUDE\.md/);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("installs both targets side by side", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-both-"));
    try {
      await initCommand(["--root", other, "--target", "both"]);

      assert.equal(
        existsSync(path.join(other, ".opencode", "skills", "couch-potator-board", "SKILL.md")),
        true,
      );
      assert.equal(
        existsSync(path.join(other, ".claude", "skills", "couch-potator-board", "SKILL.md")),
        true,
      );
      assert.equal(existsSync(path.join(other, "AGENTS.md")), true);
      assert.equal(existsSync(path.join(other, "CLAUDE.md")), true);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects an unknown target", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-badtarget-"));
    try {
      await assert.rejects(
        () => initCommand(["--root", other, "--target", "vscode"]),
        /Unknown target "vscode"/,
      );
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("lets skill install pick the Claude Code target", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-skilltarget-"));
    try {
      await initCommand(["--root", other, "--no-skill"]);
      await skillCommand(["--root", other, "--target", "claude"]);
      assert.equal(
        existsSync(path.join(other, ".claude", "skills", "couch-potator-board", "SKILL.md")),
        true,
      );
      assert.equal(existsSync(path.join(other, ".opencode")), false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("updates installed agent files to the current templates", async () => {
    const boardSkill = path.join(
      root,
      ".opencode",
      "skills",
      "couch-potator-board",
      "SKILL.md",
    );
    const stale = "---\nname: couch-potator-board\ndescription: stale\n---\n\n# Old\n";
    writeFileSync(boardSkill, stale, "utf8");
    output.clear();

    await skillCommand(["--root", root, "update"]);

    assert.notEqual(readFileSync(boardSkill, "utf8"), stale);
    assert.match(readFileSync(boardSkill, "utf8"), /couch-potator/);
    assert.match(output.logs.join("\n"), /updated/);
    assert.match(output.logs.join("\n"), /up to date/);
  });

  it("accepts --update as an alias for the update action", async () => {
    const boardSkill = path.join(
      root,
      ".opencode",
      "skills",
      "couch-potator-board",
      "SKILL.md",
    );
    writeFileSync(boardSkill, "stale\n", "utf8");

    await skillCommand(["--root", root, "--update"]);

    assert.match(readFileSync(boardSkill, "utf8"), /couch-potator/);
  });

  it("updates the runtime already installed without --target", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-skillupdate-"));
    try {
      await initCommand(["--root", other, "--target", "claude"]);
      const boardSkill = path.join(other, ".claude", "skills", "couch-potator-board", "SKILL.md");
      writeFileSync(boardSkill, "stale\n", "utf8");

      await skillCommand(["--root", other, "update"]);

      assert.match(readFileSync(boardSkill, "utf8"), /couch-potator/);
      assert.equal(existsSync(path.join(other, ".opencode")), false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("reports when an update changes nothing", async () => {
    output.clear();

    await skillCommand(["--root", root, "update"]);

    assert.match(output.logs.join("\n"), /Everything is up to date/);
    assert.doesNotMatch(output.logs.join("\n"), /updated/);
  });

  it("refuses to update a project without agent files", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-skillmissing-"));
    try {
      await initCommand(["--root", other, "--no-skill"]);
      await assert.rejects(() => skillCommand(["--root", other, "update"]), /No couch-potator/);
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

  it("records environments and warns when they are not declared", async () => {
    writeFileSync(
      path.join(root, ".couch-potator", "config.json"),
      JSON.stringify({ environments: { browser: { concurrency: 3 } } }, null, 2),
    );

    await addCommand([
      "--root",
      root,
      "Change the board",
      "-e",
      "browser",
      "-e",
      "ios-sim,android",
    ]);
    const board = scanBoard(root);
    assert.deepEqual(board.byId.get("change-the-board")?.environments, [
      "browser",
      "ios-sim",
      "android",
    ]);
    assert.match(output.logs.join(""), /unknown environment "ios-sim"/);
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

  it("exposes environments in JSON and in the plain spec", async () => {
    await addCommand(["--root", root, "Visible change", "-e", "browser,ios-sim"]);

    output.clear();
    await showCommand(["--root", root, "visible-change", "--json"]);
    const json = JSON.parse(output.logs.join(""));
    assert.deepEqual(json.environments, ["browser", "ios-sim"]);

    output.clear();
    await showCommand(["--root", root, "visible-change"]);
    assert.match(output.logs.join(""), /environments\s+browser, ios-sim/);
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

  it("sets and clears environments", async () => {
    await addCommand(["--root", root, "Card"]);
    await setCommand(["--root", root, "card", "env", "browser, ios-sim"]);

    let board = scanBoard(root);
    assert.deepEqual(board.byId.get("card")?.environments, ["browser", "ios-sim"]);

    await setCommand(["--root", root, "card", "environment", "-"]);
    board = scanBoard(root);
    assert.deepEqual(board.byId.get("card")?.environments, []);
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

  it("refreshes an existing viewer after a card change", async () => {
    await addCommand(["--root", root, "Visible card", "-m", "1"]);
    await viewCommand(["--root", root, "--no-open"]);

    const file = path.join(root, ".couch-potator", "viewer", "board.html");
    await addCommand(["--root", root, "Later card", "-m", "1"]);
    await moveCommand(["--root", root, "later-card", "in-progress"]);

    const html = readFileSync(file, "utf8");
    const match = html.match(
      /<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    assert.notEqual(match, null);
    const data = JSON.parse(match![1]!);
    const later = data.projects[0].specs.find(
      (spec: { id: string }) => spec.id === "later-card",
    );
    assert.equal(later.status, "in-progress");
  });
});
