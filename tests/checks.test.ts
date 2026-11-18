import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { checksCommand } from "../src/commands/checks.js";
import { initCommand } from "../src/commands/init.js";
import { configPath, loadConfig } from "../src/config.js";
import { captureOutput, type OutputCapture } from "./support.js";

let root: string;
let output: OutputCapture;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-checks-"));
  output = captureOutput();
  await initCommand(["--root", root, "--name", "Demo"]);
});

afterEach(() => {
  output.restore();
  rmSync(root, { recursive: true, force: true });
});

describe("checks", () => {
  it("starts empty", async () => {
    output.clear();
    assert.equal(await checksCommand(["--root", root, "--json"]), 0);
    assert.deepEqual(JSON.parse(output.logs.join("")), { fast: {}, full: {} });
  });

  it("sets fast and full commands and stores them in config", async () => {
    await checksCommand(["--root", root, "set", "fast", "install", "npm ci"]);
    await checksCommand(["--root", root, "set", "fast", "test", "npm test"]);
    await checksCommand(["--root", root, "set", "full", "build", "npm run build"]);

    const config = loadConfig(root);
    assert.deepEqual(config.checks, {
      fast: { install: "npm ci", test: "npm test" },
      full: { build: "npm run build" },
    });

    const saved = JSON.parse(readFileSync(configPath(root), "utf8"));
    assert.deepEqual(saved.checks, config.checks);
  });

  it("joins an unquoted command", async () => {
    await checksCommand(["--root", root, "set", "fast", "lint", "npm", "run", "lint"]);
    assert.equal(loadConfig(root).checks.fast.lint, "npm run lint");
  });

  it("clears one check or a whole phase", async () => {
    await checksCommand(["--root", root, "set", "fast", "test", "npm test"]);
    await checksCommand(["--root", root, "set", "fast", "lint", "npm run lint"]);

    await checksCommand(["--root", root, "clear", "fast", "test"]);
    assert.deepEqual(loadConfig(root).checks.fast, { lint: "npm run lint" });

    await checksCommand(["--root", root, "clear", "fast"]);
    assert.deepEqual(loadConfig(root).checks.fast, {});
  });

  it("prints the configured checks", async () => {
    await checksCommand(["--root", root, "set", "fast", "test", "npm test"]);
    output.clear();

    assert.equal(await checksCommand(["--root", root]), 0);
    const text = output.logs.join("\n");
    assert.match(text, /Fast checks/);
    assert.match(text, /test\s+npm test/);
    assert.match(text, /Full checks/);
    assert.match(text, /none/);
  });

  it("rejects a missing command, an unknown phase and an unknown action", async () => {
    await assert.rejects(
      () => checksCommand(["--root", root, "set", "fast", "test"]),
      /No command given/,
    );
    await assert.rejects(
      () => checksCommand(["--root", root, "set", "slow", "test", "npm test"]),
      /Unknown check phase/,
    );
    await assert.rejects(
      () => checksCommand(["--root", root, "show"]),
      /Unknown checks action/,
    );
  });

  it("reads an old config without checks and tolerates junk", () => {
    writeFileSync(configPath(root), JSON.stringify({ version: 1, board: "board" }), "utf8");
    assert.deepEqual(loadConfig(root).checks, { fast: {}, full: {} });

    writeFileSync(
      configPath(root),
      JSON.stringify({
        checks: {
          fast: { test: " npm test ", bad: 42 },
          full: "nope",
          slow: { test: "ignored" },
        },
      }),
      "utf8",
    );
    assert.deepEqual(loadConfig(root).checks, {
      fast: { test: "npm test" },
      full: {},
    });
  });
});
