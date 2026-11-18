import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { addCommand } from "../src/commands/add.js";
import { initCommand } from "../src/commands/init.js";
import { moveCommand } from "../src/commands/move.js";
import { analyseNext, nextCommand } from "../src/commands/next.js";
import { captureOutput, type OutputCapture } from "./support.js";

let root: string;
let output: OutputCapture;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-next-"));
  output = captureOutput();
  await initCommand(["--root", root, "--name", "Demo"]);
});

afterEach(() => {
  output.restore();
  rmSync(root, { recursive: true, force: true });
});

async function add(title: string, args: string[] = []): Promise<void> {
  await addCommand(["--root", root, title, "-m", "1", ...args]);
}

describe("next ordering", () => {
  it("orders by priority, then order, then kind, then id", async () => {
    await add("Could later", ["-p", "could", "-o", "10"]);
    await add("Must third", ["-p", "must", "-o", "30"]);
    await add("Must second", ["-p", "must", "-o", "20"]);
    await add("Must foundation", ["-p", "must", "-o", "20", "-k", "foundation"]);

    const result = analyseNext(root, 1);
    assert.deepEqual(
      result.eligible.map((spec) => spec.id),
      ["must-foundation", "must-second", "must-third", "could-later"],
    );
    assert.equal(result.next?.id, "must-foundation");
  });

  it("waits for unfinished dependencies", async () => {
    await add("Base");
    await add("Top", ["-d", "base"]);

    let result = analyseNext(root, 1);
    assert.deepEqual(result.eligible.map((spec) => spec.id), ["base"]);
    assert.equal(result.waiting[0]?.id, "top");
    assert.deepEqual(result.waiting[0]?.unresolved_deps, [
      { id: "base", status: "todo", title: "Base" },
    ]);

    await moveCommand(["--root", root, "base", "done"]);

    result = analyseNext(root, 1);
    assert.deepEqual(result.eligible.map((spec) => spec.id), ["top"]);
    assert.equal(result.waiting.length, 0);
  });

  it("leaves later milestones and blocked cards out of the batch", async () => {
    await add("Ready");
    await addCommand(["--root", root, "Later", "-m", "2"]);
    await addCommand(["--root", root, "Stuck", "-m", "1", "-c", "blocked"]);

    const result = analyseNext(root, 3);
    assert.deepEqual(result.eligible.map((spec) => spec.id), ["ready"]);
    assert.deepEqual(result.blocked.map((spec) => spec.id), ["stuck"]);
    assert.equal(result.out_of_milestone, 1);
  });
});

describe("next batches", () => {
  it("keeps cards that share a surface out of the same batch", async () => {
    await add("Board one", ["-s", "board-screen"]);
    await add("Board two", ["-s", "board-screen"]);
    await add("Cards", ["-s", "card-panel"]);

    const result = analyseNext(root, 2);
    assert.deepEqual(result.batch.map((spec) => spec.id), ["board-one", "cards"]);
    assert.equal(result.held_back[0]?.id, "board-two");
    assert.match(result.held_back[0]?.reason ?? "", /shares board-screen with board-one/);
  });

  it("runs a card with no surfaces alone", async () => {
    await add("Mystery");
    await add("Visible", ["-s", "board-screen"]);

    const result = analyseNext(root, 2);
    assert.deepEqual(result.batch.map((spec) => spec.id), ["mystery"]);
    assert.match(result.held_back[0]?.reason ?? "", /does not declare surfaces/);
  });

  it("resumes in-progress cards first and counts their surfaces", async () => {
    await add("Running", ["-c", "in-progress", "-s", "board-screen"]);
    await add("Same surface", ["-s", "board-screen"]);
    await add("Other surface", ["-s", "card-panel"]);

    const result = analyseNext(root, 2);
    assert.deepEqual(result.in_progress.map((spec) => spec.id), ["running"]);
    assert.equal(result.slots, 1);
    assert.deepEqual(result.batch.map((spec) => spec.id), ["other-surface"]);
    assert.equal(result.held_back[0]?.id, "same-surface");
  });

  it("holds every eligible card back when no slot is free", async () => {
    await add("Running", ["-c", "in-progress", "-s", "board-screen"]);
    await add("Ready", ["-s", "card-panel"]);

    const result = analyseNext(root, 1);
    assert.equal(result.slots, 0);
    assert.deepEqual(result.batch, []);
    assert.match(result.held_back[0]?.reason ?? "", /no free slot/);
  });
});

describe("next errors and output", () => {
  it("reports a missing current milestone", async () => {
    writeFileSync(
      path.join(root, "PROJECT.md"),
      "---\nname: Demo\nmilestones: [1]\n---\n\n# Demo\n",
      "utf8",
    );

    const result = analyseNext(root, 1);
    assert.match(result.errors.join("\n"), /current_milestone/);
  });

  it("prints JSON and exits 1 when the board has errors", async () => {
    await add("Broken", ["-d", "ghost"]);
    output.clear();

    const code = await nextCommand(["--root", root, "--json"]);
    assert.equal(code, 1);
    const parsed = JSON.parse(output.logs.join(""));
    assert.equal(parsed.project.name, "Demo");
    assert.equal(parsed.errors.length > 0, true);
  });

  it("rejects a parallel width outside 1 to 3", async () => {
    await assert.rejects(() => nextCommand(["--root", root, "--parallel", "4"]), /between 1 and 3/);
  });

  it("prints a human plan with batch, held back and waiting sections", async () => {
    await add("First", ["-s", "board-screen"]);
    await add("Second", ["-s", "board-screen"]);
    await add("Third", ["-d", "first"]);
    output.clear();

    const code = await nextCommand(["--root", root, "--parallel", "2"]);
    assert.equal(code, 0);
    const text = output.logs.join("\n");
    assert.match(text, /Batch \(1 of 2 free slot\(s\)\)/);
    assert.match(text, /Held back/);
    assert.match(text, /Waiting/);
    assert.match(text, /shares board-screen with first/);
  });
});
