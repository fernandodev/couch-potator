import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { addCommand } from "../src/commands/add.js";
import { completeCommand, completionCommand } from "../src/commands/completion.js";
import {
  COMMANDS,
  completionCandidates,
  completionScript,
  detectShell,
  installCompletion,
  parseShell,
  SET_FIELDS,
  SHELLS,
} from "../src/completion.js";
import { initCommand } from "../src/commands/init.js";
import { UsageError } from "../src/errors.js";
import { captureOutput } from "./support.js";

async function makeBoard(): Promise<string> {
  const root = mkdtempSync(path.join(tmpdir(), "cpt-complete-"));
  await initCommand(["--root", root, "--name", "Demo"]);
  await addCommand(["--root", root, "Reduce cold start", "-m", "2"]);
  await addCommand(["--root", root, "Warm pool", "-m", "3"]);
  return root;
}

function hasShell(name: string): boolean {
  return spawnSync(name, ["--version"], { encoding: "utf8" }).status === 0;
}

describe("completionCandidates", () => {
  it("offers commands at the first word", () => {
    assert.deepEqual(completionCandidates({ current: "ad", previous: [] }), ["add"]);
    const all = completionCandidates({ current: "", previous: [] });
    for (const command of COMMANDS) assert.ok(all.includes(command), command);
    assert.ok(!all.includes("__complete"));
  });

  it("offers flags after a command", () => {
    const flags = completionCandidates({ current: "--", previous: ["add"] });
    assert.ok(flags.includes("--column"));
    assert.ok(flags.includes("--kind"));
    assert.ok(flags.includes("--surface"));
    assert.ok(flags.includes("--environment"));
    assert.ok(flags.includes("--root"));
    assert.ok(!flags.includes("--force"));
  });

  it("offers the agent targets for init and skill install", () => {
    const initFlags = completionCandidates({ current: "--", previous: ["init"] });
    assert.ok(initFlags.includes("--target"));
    assert.deepEqual(completionCandidates({ current: "", previous: ["init", "--target"] }), [
      "opencode",
      "claude",
      "both",
    ]);

    const skillFlags = completionCandidates({ current: "--", previous: ["skill"] });
    assert.ok(skillFlags.includes("--target"));
    assert.deepEqual(completionCandidates({ current: "cl", previous: ["skill", "--target"] }), [
      "claude",
    ]);
  });

  it("offers the checks command, its actions and phases", () => {
    assert.deepEqual(completionCandidates({ current: "chec", previous: [] }), [
      "check",
      "checks",
    ]);
    assert.deepEqual(completionCandidates({ current: "", previous: ["checks"] }), [
      "set",
      "clear",
    ]);
    assert.deepEqual(completionCandidates({ current: "", previous: ["checks", "set"] }), [
      "fast",
      "full",
    ]);
    const flags = completionCandidates({ current: "--", previous: ["checks"] });
    assert.ok(flags.includes("--json"));
  });

  it("offers the next command and its flags", () => {
    assert.deepEqual(completionCandidates({ current: "nex", previous: [] }), ["next"]);
    const flags = completionCandidates({ current: "--", previous: ["next"] });
    assert.ok(flags.includes("--parallel"));
    assert.ok(flags.includes("--json"));
  });

  it("offers the body command and its cards and file flag", async () => {
    const root = await makeBoard();
    try {
      assert.deepEqual(completionCandidates({ current: "bod", previous: [] }), ["body"]);
      assert.deepEqual(completionCandidates({ current: "", previous: ["body"], root }), [
        "reduce-cold-start",
        "warm-pool",
      ]);
      const flags = completionCandidates({ current: "--", previous: ["body"] });
      assert.ok(flags.includes("--file"));
      assert.ok(flags.includes("--root"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("completes columns", () => {
    assert.deepEqual(completionCandidates({ current: "", previous: ["move", "a-card"] }), [
      "todo",
      "in-progress",
      "blocked",
      "done",
    ]);
  });

  it("completes kinds for a flag value", () => {
    assert.deepEqual(completionCandidates({ current: "", previous: ["add", "--kind"] }), [
      "foundation",
      "design",
      "feature",
      "quality",
      "release",
      "fix",
    ]);
  });

  it("completes inline flag values", () => {
    assert.deepEqual(completionCandidates({ current: "--kind=fi", previous: ["add"] }), [
      "--kind=fix",
    ]);
  });

  it("completes card ids and milestones from the board", async () => {
    const root = await makeBoard();
    try {
      const cards = completionCandidates({ current: "", previous: ["show"], root });
      assert.deepEqual(cards, ["reduce-cold-start", "warm-pool"]);

      const filtered = completionCandidates({ current: "warm", previous: ["show"], root });
      assert.deepEqual(filtered, ["warm-pool"]);

      const milestones = completionCandidates({
        current: "",
        previous: ["set", "warm-pool", "milestone"],
        root,
      });
      assert.deepEqual(milestones, ["1", "2", "3"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("completes set fields", async () => {
    const root = await makeBoard();
    try {
      const fields = completionCandidates({ current: "", previous: ["set", "warm-pool"], root });
      assert.deepEqual(fields, [...SET_FIELDS]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("completes dependency links", async () => {
    const root = await makeBoard();
    try {
      const first = completionCandidates({ current: "", previous: ["dep"], root });
      assert.ok(first.includes("add"));
      assert.ok(first.includes("rm"));
      assert.ok(first.includes("warm-pool"));

      const second = completionCandidates({ current: "", previous: ["dep", "add"], root });
      assert.deepEqual(second, ["reduce-cold-start", "warm-pool"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("completes completion actions and shells", () => {
    const actions = completionCandidates({ current: "", previous: ["completion"] });
    assert.deepEqual(actions, ["install", ...SHELLS]);
    assert.deepEqual(completionCandidates({ current: "", previous: ["completion", "install"] }), [
      ...SHELLS,
    ]);
  });

  it("reads --root before the command and leaves its value to the shell", async () => {
    const root = await makeBoard();
    try {
      const cards = completionCandidates({
        current: "",
        previous: ["--root", root, "show"],
      });
      assert.deepEqual(cards, ["reduce-cold-start", "warm-pool"]);

      assert.deepEqual(completionCandidates({ current: "", previous: ["--root"] }), []);
      assert.deepEqual(completionCandidates({ current: "--root=/tmp", previous: [] }), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns no card candidates outside a board", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "cpt-noboard-"));
    try {
      assert.deepEqual(completionCandidates({ current: "", previous: ["show"], root: empty }), []);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("shell detection", () => {
  it("maps shell names to a supported shell", () => {
    assert.equal(parseShell("sh"), "bash");
    assert.equal(parseShell("BASH"), "bash");
    assert.equal(parseShell("fish"), "fish");
    assert.equal(parseShell("zsh"), "zsh");
    assert.equal(parseShell("nushell"), null);
  });

  it("detects the shell from $SHELL", () => {
    assert.equal(detectShell({ SHELL: "/opt/homebrew/bin/fish" }), "fish");
    assert.equal(detectShell({ SHELL: "/bin/zsh" }), "zsh");
    assert.equal(detectShell({ SHELL: "/bin/bash" }), "bash");
    assert.equal(detectShell({ SHELL: "/bin/sh" }), "bash");
    assert.equal(detectShell({ SHELL: "/bin/dash" }), null);
    assert.equal(detectShell({}), null);
  });
});

describe("completion scripts", () => {
  for (const shell of SHELLS) {
    const binary = shell === "fish" ? "fish" : shell;
    const available = hasShell(binary);

    it(`is valid ${shell} syntax`, { skip: !available && `${binary} is not installed` }, () => {
      const dir = mkdtempSync(path.join(tmpdir(), `cpt-${shell}-`));
      try {
        const file = path.join(dir, shell === "bash" ? "completion.bash" : `completion.${shell}`);
        writeFileSync(file, completionScript(shell), "utf8");
        const result = shell === "bash"
          ? spawnSync("bash", ["-n", file], { encoding: "utf8" })
          : spawnSync(shell, ["-n", file], { encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  it("calls the hidden completion protocol", () => {
    for (const shell of SHELLS) {
      const script = completionScript(shell);
      assert.ok(script.includes("couch-potator __complete"), shell);
    }
  });
});

describe("installCompletion", () => {
  it("writes a fish completion fish loads automatically", () => {
    const home = mkdtempSync(path.join(tmpdir(), "cpt-home-"));
    try {
      const result = installCompletion({ shell: "fish", home, env: {} });
      assert.equal(result.scriptPath, path.join(home, ".config", "fish", "completions", "couch-potator.fish"));
      assert.equal(result.rcPath, null);
      assert.equal(result.rcUpdated, false);
      assert.equal(existsSync(result.scriptPath), true);
      assert.equal(readFileSync(result.scriptPath, "utf8"), completionScript("fish"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("respects XDG directories", () => {
    const home = mkdtempSync(path.join(tmpdir(), "cpt-home-"));
    try {
      const env = {
        XDG_CONFIG_HOME: path.join(home, "cfg"),
        XDG_DATA_HOME: path.join(home, "data"),
      };
      const zsh = installCompletion({ shell: "zsh", home, env });
      assert.equal(zsh.scriptPath, path.join(env.XDG_CONFIG_HOME, "couch-potator", "completion.zsh"));
      assert.equal(zsh.rcPath, path.join(home, ".zshrc"));

      const bash = installCompletion({ shell: "bash", home, env });
      assert.equal(
        bash.scriptPath,
        path.join(env.XDG_DATA_HOME, "bash-completion", "completions", "couch-potator"),
      );
      assert.equal(bash.rcPath, path.join(home, ".bashrc"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("wires zsh once and keeps the marker on repeat runs", () => {
    const home = mkdtempSync(path.join(tmpdir(), "cpt-home-"));
    try {
      const first = installCompletion({ shell: "zsh", home, env: {} });
      assert.equal(first.rcUpdated, true);

      const rc = readFileSync(path.join(home, ".zshrc"), "utf8");
      assert.ok(rc.includes("# >>> couch-potator completions >>>"));
      assert.ok(rc.includes(first.scriptPath));

      const second = installCompletion({ shell: "zsh", home, env: {} });
      assert.equal(second.rcUpdated, false);
      const after = readFileSync(path.join(home, ".zshrc"), "utf8");
      assert.equal(after, rc);
      assert.equal(after.split("# >>> couch-potator completions >>>").length, 2);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("never writes when it is a dry run", () => {
    const home = mkdtempSync(path.join(tmpdir(), "cpt-home-"));
    try {
      const result = installCompletion({ shell: "zsh", home, env: {}, dryRun: true });
      assert.equal(result.written, false);
      assert.equal(result.rcUpdated, false);
      assert.equal(existsSync(result.scriptPath), false);
      assert.equal(existsSync(path.join(home, ".zshrc")), false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("can skip shell startup files", () => {
    const home = mkdtempSync(path.join(tmpdir(), "cpt-home-"));
    try {
      const result = installCompletion({ shell: "bash", home, env: {}, skipRc: true });
      assert.equal(existsSync(result.scriptPath), true);
      assert.equal(existsSync(path.join(home, ".bashrc")), false);
      assert.ok(result.rcSnippet?.includes(result.scriptPath));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("completion command", () => {
  it("prints a script for the named shell", async () => {
    const output = captureOutput();
    try {
      assert.equal(await completionCommand(["fish"]), 0);
      assert.equal(output.logs.join(""), completionScript("fish"));
    } finally {
      output.restore();
    }
  });

  it("prints the detected shell script", async () => {
    const output = captureOutput();
    const previous = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
    try {
      assert.equal(await completionCommand([]), 0);
      assert.equal(output.logs.join(""), completionScript("zsh"));
    } finally {
      if (previous === undefined) delete process.env.SHELL;
      else process.env.SHELL = previous;
      output.restore();
    }
  });

  it("rejects an unknown shell", async () => {
    await assert.rejects(() => completionCommand(["install", "nushell"]), UsageError);
  });

  it("installs into a temporary home", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "cpt-home-"));
    const output = captureOutput();
    const saved = {
      HOME: process.env.HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    };
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = path.join(home, ".config");
    process.env.XDG_DATA_HOME = path.join(home, ".local", "share");
    try {
      assert.equal(await completionCommand(["install", "fish"]), 0);
      const file = path.join(home, ".config", "fish", "completions", "couch-potator.fish");
      assert.equal(existsSync(file), true);
      assert.match(output.logs.join(""), /Restart your shell/);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      output.restore();
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("__complete protocol", () => {
  it("prints one candidate per line", async () => {
    const output = captureOutput();
    try {
      assert.equal(await completeCommand(["--current=mo", "--"]), 0);
      assert.equal(output.logs.join(""), "move\n");
    } finally {
      output.restore();
    }
  });

  it("stays silent when there is nothing to offer", async () => {
    const output = captureOutput();
    try {
      assert.equal(await completeCommand(["--current=", "--", "--root"]), 0);
      assert.equal(output.logs.join(""), "");
    } finally {
      output.restore();
    }
  });

  it("does not fail on malformed arguments", async () => {
    const output = captureOutput();
    try {
      assert.equal(await completeCommand(["--current"]), 0);
      assert.equal(output.logs.join(""), "");
    } finally {
      output.restore();
    }
  });
});
