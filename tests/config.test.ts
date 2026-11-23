import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { initCommand } from "../src/commands/init.js";
import { configPath, loadConfig, saveConfig } from "../src/config.js";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "cpt-config-"));
  await initCommand(["--root", root, "--name", "Demo", "--no-skill"]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("config environments", () => {
  it("starts with no environments and no default", () => {
    const config = loadConfig(root);
    assert.deepEqual(config.environments, {});
    assert.equal(config.defaultEnvironment, null);

    const raw = JSON.parse(readFileSync(configPath(root), "utf8"));
    assert.deepEqual(raw.environments, {});
    assert.equal("default_environment" in raw, false);
  });

  it("round-trips environments and default_environment", () => {
    const config = loadConfig(root);
    config.environments = {
      browser: { concurrency: 3, hint: "npm run dev -- --port $SLOT" },
      app: { concurrency: 1, hint: null },
    };
    config.defaultEnvironment = "browser";
    saveConfig(root, config);

    const raw = JSON.parse(readFileSync(configPath(root), "utf8"));
    assert.equal(raw.default_environment, "browser");
    assert.deepEqual(loadConfig(root).environments, {
      browser: { concurrency: 3, hint: "npm run dev -- --port $SLOT" },
      app: { concurrency: 1, hint: null },
    });
    assert.equal(loadConfig(root).defaultEnvironment, "browser");
  });

  it("falls back to one instance for a bad concurrency and ignores bad hints", () => {
    writeFileSync(
      configPath(root),
      JSON.stringify({
        environments: {
          browser: { concurrency: 0, hint: 42 },
          ios: { concurrency: "4" },
          "  ": { concurrency: 2 },
        },
      }),
      "utf8",
    );

    const config = loadConfig(root);
    assert.deepEqual(config.environments, {
      browser: { concurrency: 1, hint: null },
      ios: { concurrency: 1, hint: null },
    });
  });

  it("keeps an unknown environment out of the declared set", () => {
    writeFileSync(
      configPath(root),
      JSON.stringify({ environments: { browser: { concurrency: 2 } } }),
      "utf8",
    );
    const config = loadConfig(root);
    assert.deepEqual(Object.keys(config.environments), ["browser"]);
  });
});
