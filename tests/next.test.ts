import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { addCommand } from "../src/commands/add.js";
import { initCommand } from "../src/commands/init.js";
import { moveCommand } from "../src/commands/move.js";
import { analyseNext, nextCommand } from "../src/commands/next.js";
import { configPath } from "../src/config.js";
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

function writeConfig(
  environments: Record<string, { concurrency?: number; hint?: string }>,
  defaultEnvironment?: string,
): void {
  const config = JSON.parse(readFileSync(configPath(root), "utf8")) as Record<string, unknown>;
  config.environments = environments;
  if (defaultEnvironment) config.default_environment = defaultEnvironment;
  else delete config.default_environment;
  writeFileSync(configPath(root), `${JSON.stringify(config, null, 2)}\n`, "utf8");
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

describe("next environments", () => {
  it("reports a pool without narrowing the work batch", async () => {
    writeConfig({ app: { concurrency: 1 } }, "app");
    await add("Board one", ["-s", "board-screen"]);
    await add("Board two", ["-s", "card-panel"]);

    const result = analyseNext(root, 2);
    assert.deepEqual(result.batch.map((spec) => spec.id), ["board-one", "board-two"]);
    assert.deepEqual(result.batch[0]?.environments, ["app"]);
    assert.equal(result.environments.app?.concurrency, 1);
    assert.equal(result.environments.app?.in_use, 0);
    assert.equal(result.environments.app?.free, 1);
  });

  it("counts in-progress cards against the pool", async () => {
    writeConfig({ app: { concurrency: 1 } }, "app");
    await add("Running", ["-c", "in-progress", "-s", "board-screen"]);
    await add("Ready", ["-s", "card-panel"]);

    const result = analyseNext(root, 2);
    assert.equal(result.environments.app?.in_use, 1);
    assert.equal(result.environments.app?.free, 0);
    assert.deepEqual(result.batch.map((spec) => spec.id), ["ready"]);
  });

  it("falls back from the default to the only declared environment, then to app", async () => {
    await add("Visible", ["-s", "board-screen"]);
    assert.deepEqual(analyseNext(root, 1).batch[0]?.environments, ["app"]);

    writeConfig({ browser: { concurrency: 3 } });
    assert.deepEqual(analyseNext(root, 1).batch[0]?.environments, ["browser"]);

    writeConfig({ browser: { concurrency: 3 }, ios: { concurrency: 2 } }, "browser");
    assert.deepEqual(analyseNext(root, 1).batch[0]?.environments, ["browser"]);
  });

  it("leaves the environment unset when several are declared without a default", async () => {
    writeConfig({ browser: { concurrency: 3 }, ios: { concurrency: 2 } });
    await add("Ambiguous", ["-s", "board-screen"]);

    const result = analyseNext(root, 1);
    assert.deepEqual(result.batch[0]?.environments, []);
    assert.match(result.warnings.join("\n"), /no environment|default_environment/);
  });

  it("never gives a card without surfaces an environment", async () => {
    writeConfig({ browser: { concurrency: 3 } }, "browser");
    await add("Backend work");

    const result = analyseNext(root, 1);
    assert.deepEqual(result.batch[0]?.environments, []);
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

  it("clamps a parallel width above 3 and explains it", async () => {
    await add("Ready");
    output.clear();

    const code = await nextCommand(["--root", root, "--parallel", "9", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(output.logs.join(""));
    assert.equal(parsed.parallel, 3);
    assert.match(parsed.warnings.join("\n"), /above the cap; using 3/);
  });

  it("rejects a parallel width below 1", async () => {
    await assert.rejects(() => nextCommand(["--root", root, "--parallel", "0"]), /at least 1/);
    await assert.rejects(() => nextCommand(["--root", root, "--parallel", "two"]), /at least 1/);
  });

  it("prints the environment pools beside the batch", async () => {
    writeConfig({ browser: { concurrency: 3 }, app: { concurrency: 1 } }, "browser");
    await add("Visible", ["-s", "board-screen"]);
    output.clear();

    const code = await nextCommand(["--root", root, "--parallel", "1"]);
    assert.equal(code, 0);
    const text = output.logs.join("\n");
    assert.match(text, /Environments: browser — 0\/3 in use · app — free/);
    assert.match(text, /env: browser/);
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
