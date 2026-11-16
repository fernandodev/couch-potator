import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addCommand } from "../src/commands/add.js";
import { checkCommand } from "../src/commands/check.js";
import { initCommand } from "../src/commands/init.js";
import { linkCommand } from "../src/commands/link.js";
import { listCommand } from "../src/commands/list.js";
import { moveCommand } from "../src/commands/move.js";
import { rmCommand } from "../src/commands/rm.js";
import { setCommand } from "../src/commands/set.js";
import { showCommand } from "../src/commands/show.js";
import { viewCommand } from "../src/commands/view.js";
import { scanBoard } from "../src/board.js";
import { parseMarkdown } from "../src/frontmatter.js";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-cmd-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  await initCommand(["--root", root, "--name", "Demo"]);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const cardPath = (column: string, id: string): string => path.join(root, "board", column, `${id}.md`);

describe("init", () => {
  it("creates the board, config, brief and agent files", () => {
    expect(existsSync(path.join(root, "board", "todo"))).toBe(true);
    expect(existsSync(path.join(root, "board", "in-progress"))).toBe(true);
    expect(existsSync(path.join(root, "board", "blocked"))).toBe(true);
    expect(existsSync(path.join(root, "board", "done"))).toBe(true);
    expect(existsSync(path.join(root, ".couch-potator", "config.json"))).toBe(true);
    expect(existsSync(path.join(root, "PROJECT.md"))).toBe(true);
    expect(existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(existsSync(path.join(root, ".opencode", "skills", "board", "SKILL.md"))).toBe(true);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toContain(".couch-potator/viewer/");

    const brief = parseMarkdown(readFileSync(path.join(root, "PROJECT.md"), "utf8"));
    expect(brief.data.name).toBe("Demo");
    expect(brief.data.current_milestone).toBe(1);
  });

  it("is idempotent and keeps an existing brief", async () => {
    await initCommand(["--root", root, "--name", "Renamed"]);
    const brief = parseMarkdown(readFileSync(path.join(root, "PROJECT.md"), "utf8"));
    expect(brief.data.name).toBe("Demo");
  });

  it("can skip the agent scaffolding", async () => {
    const other = mkdtempSync(path.join(tmpdir(), "cpt-noskill-"));
    try {
      await initCommand(["--root", other, "--no-skill"]);
      expect(existsSync(path.join(other, ".opencode"))).toBe(false);
      expect(existsSync(path.join(other, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("add", () => {
  it("writes a card with the full frontmatter", async () => {
    await addCommand(["--root", root, "Reduce cold start", "-k", "feature", "-m", "2", "-p", "high"]);
    const parsed = parseMarkdown(readFileSync(cardPath("todo", "reduce-cold-start"), "utf8"));
    expect(parsed.data.title).toBe("Reduce cold start");
    expect(parsed.data.kind).toBe("feature");
    expect(parsed.data.milestone).toBe(2);
    expect(parsed.data.priority).toBe("high");
    expect(parsed.data.order).toBe(10);
    expect(parsed.body).toContain("Done when");
  });

  it("deduplicates ids and appends to the column", async () => {
    await addCommand(["--root", root, "Same title"]);
    await addCommand(["--root", root, "Same title"]);
    const board = scanBoard(root);
    expect(board.cards.map((card) => card.id).sort()).toEqual(["same-title", "same-title-2"]);
    expect(board.cards.every((card) => card.order === 10 || card.order === 20)).toBe(true);
  });

  it("accepts column aliases", async () => {
    await addCommand(["--root", root, "Doing now", "-c", "wip"]);
    expect(existsSync(cardPath("in-progress", "doing-now"))).toBe(true);
  });

  it("rejects a missing title", async () => {
    await expect(addCommand(["--root", root])).rejects.toThrow(/title/);
  });

  it("warns but records forward dependencies", async () => {
    await addCommand(["--root", root, "Depends early", "-d", "not-yet"]);
    const board = scanBoard(root);
    expect(board.byId.get("depends-early")?.dependsOn).toEqual(["not-yet"]);
  });
});

describe("list and show", () => {
  it("filters by column and milestone", async () => {
    await addCommand(["--root", root, "One", "-m", "1"]);
    await addCommand(["--root", root, "Two", "-m", "2", "-c", "done"]);

    const logs: string[] = [];
    vi.mocked(console.log).mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });

    await listCommand(["--root", root, "-m", "2", "--ids"]);
    expect(logs.join("\n")).toBe("two");
  });

  it("prints raw markdown with --raw", async () => {
    await addCommand(["--root", root, "Raw card"]);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    });

    await showCommand(["--root", root, "raw-card", "--raw"]);
    expect(chunks.join("")).toContain("title: Raw card");
  });
});

describe("move", () => {
  it("moves the file and renumbers both columns", async () => {
    await addCommand(["--root", root, "First"]);
    await addCommand(["--root", root, "Second"]);
    await addCommand(["--root", root, "Third"]);

    await moveCommand(["--root", root, "second", "in-progress"]);
    expect(existsSync(cardPath("todo", "second"))).toBe(false);
    expect(existsSync(cardPath("in-progress", "second"))).toBe(true);

    const board = scanBoard(root);
    expect(board.byId.get("first")?.order).toBe(10);
    expect(board.byId.get("third")?.order).toBe(20);
    expect(board.byId.get("second")?.status).toBe("in-progress");
  });

  it("supports --top, --before and --after", async () => {
    await addCommand(["--root", root, "Alpha"]);
    await addCommand(["--root", root, "Beta"]);
    await addCommand(["--root", root, "Gamma"]);

    await moveCommand(["--root", root, "gamma", "in-progress"]);
    await moveCommand(["--root", root, "gamma", "todo", "--top"]);

    const board = scanBoard(root);
    const todo = board.cards.filter((card) => card.status === "todo").map((card) => card.id);
    expect(todo).toEqual(["gamma", "alpha", "beta"]);
  });

  it("rejects an unknown column", async () => {
    await addCommand(["--root", root, "Card"]);
    await expect(moveCommand(["--root", root, "card", "review"])).rejects.toThrow(/Unknown column/);
  });
});

describe("set", () => {
  it("sets and clears fields", async () => {
    await addCommand(["--root", root, "Card"]);
    await setCommand(["--root", root, "card", "blocked_reason", "waiting", "on", "review"]);
    await setCommand(["--root", root, "card", "milestone", "3"]);

    let board = scanBoard(root);
    expect(board.byId.get("card")?.blockedReason).toBe("waiting on review");
    expect(board.byId.get("card")?.milestone).toBe(3);

    await setCommand(["--root", root, "card", "blocked_reason", "-"]);
    board = scanBoard(root);
    expect(board.byId.get("card")?.blockedReason).toBeNull();
  });

  it("rejects unknown kinds", async () => {
    await addCommand(["--root", root, "Card"]);
    await expect(setCommand(["--root", root, "card", "kind", "nope"])).rejects.toThrow(/Unknown kind/);
  });
});

describe("links", () => {
  it("adds and removes dependencies", async () => {
    await addCommand(["--root", root, "Base"]);
    await addCommand(["--root", root, "Top"]);
    await linkCommand(["--root", root, "add", "top", "base"], "dep");

    let board = scanBoard(root);
    expect(board.byId.get("top")?.dependsOn).toEqual(["base"]);

    await linkCommand(["--root", root, "rm", "top", "base"], "dep");
    board = scanBoard(root);
    expect(board.byId.get("top")?.dependsOn).toEqual([]);
  });

  it("refuses to create a cycle and leaves the file untouched", async () => {
    await addCommand(["--root", root, "A"]);
    await addCommand(["--root", root, "B"]);
    await linkCommand(["--root", root, "add", "b", "a"], "dep");

    await expect(linkCommand(["--root", root, "add", "a", "b"], "dep")).rejects.toThrow(/cycle/);
    const board = scanBoard(root);
    expect(board.byId.get("a")?.dependsOn).toEqual([]);
  });

  it("records related links without cycle checks", async () => {
    await addCommand(["--root", root, "A"]);
    await addCommand(["--root", root, "B"]);
    await linkCommand(["--root", root, "add", "a", "b"], "rel");
    await linkCommand(["--root", root, "add", "b", "a"], "rel");

    const board = scanBoard(root);
    expect(board.byId.get("a")?.related).toEqual(["b"]);
    expect(board.byId.get("b")?.related).toEqual(["a"]);
  });
});

describe("rm", () => {
  it("deletes with --force", async () => {
    await addCommand(["--root", root, "Gone"]);
    await rmCommand(["--root", root, "gone", "--force"]);
    expect(existsSync(cardPath("todo", "gone"))).toBe(false);
  });

  it("refuses without confirmation when not a tty", async () => {
    await addCommand(["--root", root, "Gone"]);
    await expect(rmCommand(["--root", root, "gone"])).rejects.toThrow(/without confirmation/);
  });
});

describe("check", () => {
  it("exits 0 on a clean board", async () => {
    await addCommand(["--root", root, "Clean"]);
    await expect(checkCommand(["--root", root])).resolves.toBe(0);
  });

  it("exits 1 on a dangling dependency", async () => {
    await addCommand(["--root", root, "Broken", "-d", "ghost"]);
    await expect(checkCommand(["--root", root])).resolves.toBe(1);
  });

  it("exits 1 on warnings with --strict", async () => {
    await addCommand(["--root", root, "Category", "-k", "weird"]);
    await expect(checkCommand(["--root", root])).resolves.toBe(0);
    await expect(checkCommand(["--root", root, "--strict"])).resolves.toBe(1);
  });
});

describe("view", () => {
  it("writes a self-contained page", async () => {
    await addCommand(["--root", root, "Visible card", "-m", "1"]);
    await viewCommand(["--root", root, "--no-open"]);

    const file = path.join(root, ".couch-potator", "viewer", "board.html");
    expect(existsSync(file)).toBe(true);
    const html = readFileSync(file, "utf8");
    expect(html).toContain('id="board-data"');
    expect(html).toContain("Visible card");
    expect(html).not.toContain("COUCH_POTATOR");
    expect(html).not.toContain("/api/state");
    expect(html).toContain("read only");
  });
});
