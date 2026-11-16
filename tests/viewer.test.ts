import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanBoard } from "../src/board.js";
import { buildPayload } from "../src/viewer/data.js";
import { buildViewer } from "../src/viewer/build.js";

let root: string;

const write = (column: string, id: string, frontmatter: string, body = "## Why\n\nBecause.\n"): void => {
  const dir = path.join(root, "board", column);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}`);
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-viewer-"));
  mkdirSync(path.join(root, ".couch-potator"), { recursive: true });
  writeFileSync(path.join(root, ".couch-potator", "config.json"), "{}");
  writeFileSync(
    path.join(root, "PROJECT.md"),
    `---\nname: Viewer Demo\ncurrent_milestone: 2\nmilestones: [1, 2]\n---\n\n# Viewer Demo\n\nA brief.\n`,
  );
  write("todo", "base", "title: Base\nkind: foundation\nmilestone: 1");
  write("todo", "next", "title: Next\ndepends_on: [base]\nmilestone: 2", "## Why\n\nNext body.\n");
  write("blocked", "stuck", "title: Stuck\nmilestone: 2\nblocked_reason: waiting");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildPayload", () => {
  it("carries the project, milestones and specs", () => {
    const board = scanBoard(root);
    const payload = buildPayload(root, board);

    expect(payload.projects).toHaveLength(1);
    const project = payload.projects[0]!;
    expect(project.name).toBe("Viewer Demo");
    expect(project.milestones).toEqual([1, 2]);
    expect(project.current_milestone).toBe(2);
    expect(project.brief).toContain("A brief.");
    expect(project.brief_file).toBe("PROJECT.md");
    expect(project.specs.map((spec) => spec.id)).toEqual(["base", "next", "stuck"]);

    const next = project.specs.find((spec) => spec.id === "next")!;
    expect(next.status).toBe("todo");
    expect(next.depends_on).toEqual(["base"]);
    expect(next.file).toBe("board/todo/next.md");
    expect(next.body).toContain("Next body.");
  });

  it("falls back to the newest milestone when the brief has none", () => {
    writeFileSync(path.join(root, "PROJECT.md"), `---\nname: NoBrief\n---\n\n# NoBrief\n`);
    const payload = buildPayload(root, scanBoard(root));
    expect(payload.projects[0]?.current_milestone).toBe(2);
  });

  it("honours a milestone override, including All", () => {
    const board = scanBoard(root);
    expect(buildPayload(root, board, { milestone: 1 }).projects[0]?.current_milestone).toBe(1);
    expect(buildPayload(root, board, { milestone: null }).projects[0]?.current_milestone).toBeNull();
  });
});

describe("buildViewer", () => {
  it("inlines data, styles, scripts and vendors", () => {
    const result = buildViewer(root, scanBoard(root));

    expect(result.html).toContain('<script id="board-data" type="application/json">');
    expect(result.html).toContain("<style>");
    expect(result.html).toContain("marked");
    expect(result.html).toContain("DOMPurify");
    expect(result.html).not.toContain("COUCH_POTATOR");
    expect(result.html).not.toMatch(/<script[^>]+src=/);
    expect(result.html).not.toMatch(/<link[^>]+stylesheet/);
    expect(result.cards).toBe(3);
    expect(result.outPath.endsWith(path.join(".couch-potator", "viewer", "board.html"))).toBe(true);
  });

  it("embeds the spec bodies for the modal", () => {
    const result = buildViewer(root, scanBoard(root));
    const match = result.html.match(/<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]!);
    const spec = data.projects[0].specs.find((item: { id: string }) => item.id === "next");
    expect(spec.body).toContain("Next body.");
  });

  it("escapes a closing script tag inside spec bodies", () => {
    write("done", "sneaky", "title: Sneaky", "hello </script> world");
    const result = buildViewer(root, scanBoard(root));
    const scripts = result.html.match(/<script/g) ?? [];
    // one data block, one vendor bundle pair, one app bundle
    expect(scripts.length).toBe(4);
    expect(result.html).toContain("\\u003c/script>");
    expect(result.html).not.toContain("</script> world");
  });
});
