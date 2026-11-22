import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { scanBoard } from "../src/board.js";
import { buildViewer, writeViewer } from "../src/viewer/build.js";
import { buildPayload } from "../src/viewer/data.js";
import { refreshViewer } from "../src/viewer/refresh.js";

let root: string;

const write = (
  column: string,
  id: string,
  frontmatter: string,
  body = "## Why\n\nBecause.\n",
): void => {
  const dir = path.join(root, "board", column);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}`);
};

interface ViewerPayloadFile {
  generated: string;
  projects: Array<{
    current_milestone: number | null;
    specs: Array<{ id: string; status: string }>;
  }>;
}

const payloadOf = (html: string): ViewerPayloadFile => {
  const match = html.match(
    /<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/,
  );
  assert.notEqual(match, null);
  return JSON.parse(match![1]!);
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
  write(
    "todo",
    "next",
    "title: Next\ndepends_on: [base]\nsurfaces: [board-screen]\nmilestone: 2",
    "## Why\n\nNext body.\n",
  );
  write("blocked", "stuck", "title: Stuck\nmilestone: 2\nblocked_reason: waiting");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildPayload", () => {
  it("carries the project, milestones and specs", () => {
    const board = scanBoard(root);
    const payload = buildPayload(root, board);

    assert.equal(payload.projects.length, 1);
    const project = payload.projects[0]!;
    assert.equal(project.name, "Viewer Demo");
    assert.deepEqual(project.milestones, [1, 2]);
    assert.equal(project.current_milestone, 2);
    assert.ok(project.brief.includes("A brief."));
    assert.equal(project.brief_file, "PROJECT.md");
    assert.deepEqual(
      project.specs.map((spec) => spec.id),
      ["base", "next", "stuck"],
    );

    const next = project.specs.find((spec) => spec.id === "next")!;
    assert.equal(next.status, "todo");
    assert.deepEqual(next.depends_on, ["base"]);
    assert.deepEqual(next.surfaces, ["board-screen"]);
    assert.equal(next.file, "board/todo/next.md");
    assert.ok(next.body.includes("Next body."));
  });

  it("falls back to the newest milestone when the brief has none", () => {
    writeFileSync(path.join(root, "PROJECT.md"), `---\nname: NoBrief\n---\n\n# NoBrief\n`);
    const payload = buildPayload(root, scanBoard(root));
    assert.equal(payload.projects[0]?.current_milestone, 2);
  });

  it("honours a milestone override, including All", () => {
    const board = scanBoard(root);
    assert.equal(buildPayload(root, board, { milestone: 1 }).projects[0]?.current_milestone, 1);
    assert.equal(buildPayload(root, board, { milestone: null }).projects[0]?.current_milestone, null);
  });
});

describe("buildViewer", () => {
  it("inlines data, styles, scripts and vendors", () => {
    const result = buildViewer(root, scanBoard(root));

    assert.ok(result.html.includes('<script id="board-data" type="application/json">'));
    assert.ok(result.html.includes("<style>"));
    assert.ok(result.html.includes("marked"));
    assert.ok(result.html.includes("DOMPurify"));
    assert.ok(!result.html.includes("COUCH_POTATOR"));
    assert.doesNotMatch(result.html, /<script[^>]+src=/);
    assert.doesNotMatch(result.html, /<link[^>]+stylesheet/);
    assert.equal(result.cards, 3);
    assert.ok(result.outPath.endsWith(path.join(".couch-potator", "viewer", "board.html")));
  });

  it("embeds the spec bodies for the modal", () => {
    const result = buildViewer(root, scanBoard(root));
    const match = result.html.match(
      /<script id="board-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    assert.notEqual(match, null);
    const data = JSON.parse(match![1]!);
    const spec = data.projects[0].specs.find((item: { id: string }) => item.id === "next");
    assert.ok(spec.body.includes("Next body."));
  });

  it("escapes a closing script tag inside spec bodies", () => {
    write("done", "sneaky", "title: Sneaky", "hello </script> world");
    const result = buildViewer(root, scanBoard(root));
    const scripts = result.html.match(/<script/g) ?? [];
    // one data block, one vendor bundle pair, one app bundle
    assert.equal(scripts.length, 4);
    assert.ok(result.html.includes("\\u003c/script>"));
    assert.ok(!result.html.includes("</script> world"));
  });
});

describe("refreshViewer", () => {
  const viewerPath = (): string =>
    path.join(root, ".couch-potator", "viewer", "board.html");

  it("does nothing when no viewer was generated", () => {
    assert.equal(refreshViewer(root), null);
    assert.equal(existsSync(viewerPath()), false);
  });

  it("rewrites an existing viewer after the board changes", () => {
    writeViewer(root, scanBoard(root));
    assert.ok(!readFileSync(viewerPath(), "utf8").includes("Fresh body."));

    write("todo", "fresh", "title: Fresh\nmilestone: 2", "## Why\n\nFresh body.\n");
    const result = refreshViewer(root);

    assert.notEqual(result, null);
    assert.ok(readFileSync(viewerPath(), "utf8").includes("Fresh body."));
  });

  it("keeps the milestone the viewer was generated with", () => {
    writeViewer(root, scanBoard(root), { milestone: 1 });
    const current = (): number | null | undefined =>
      payloadOf(readFileSync(viewerPath(), "utf8")).projects[0]?.current_milestone;
    assert.equal(current(), 1);

    write("todo", "fresh", "title: Fresh\nmilestone: 1");
    refreshViewer(root);

    assert.equal(current(), 1);
  });
});
