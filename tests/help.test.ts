import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { scanBoard } from "../src/board.js";
import { initCommand } from "../src/commands/init.js";
import { COMMANDS, completionCandidates } from "../src/completion.js";
import {
  COMMAND_HELP,
  COMMAND_ORDER,
  commandHelpText,
  generalHelpText,
  helpOptionsFor,
} from "../src/help.js";
import { run } from "../src/run.js";
import { captureOutput, type OutputCapture } from "./support.js";

const ALIASES: Record<string, string> = {
  ls: "list",
  mv: "move",
  board: "view",
};

let root: string;
let output: OutputCapture;

beforeEach(() => {
  output = captureOutput();
  root = mkdtempSync(path.join(tmpdir(), "cpt-help-"));
});

afterEach(() => {
  output.restore();
  rmSync(root, { recursive: true, force: true });
});

const printed = (): string => output.logs.join("\n");

describe("help text", () => {
  it("covers every command the shell completes", () => {
    for (const name of COMMANDS) {
      assert.ok(COMMAND_HELP[ALIASES[name] ?? name], `no help for ${name}`);
    }
  });

  it("lists every command and global flag in the top-level help", () => {
    const text = generalHelpText("1.2.3");
    assert.match(text, /couch-potator/);
    assert.match(text, /v1\.2\.3/);
    assert.match(text, /Commands/);
    for (const name of COMMAND_ORDER) assert.ok(text.includes(name), name);
    assert.match(text, /--root <path>/);
    assert.match(text, /-h, --help/);
    assert.match(text, /--version/);
  });

  it("puts a usage block in every command help", () => {
    for (const name of COMMAND_ORDER) {
      const text = commandHelpText(name);
      assert.ok(text, name);
      assert.match(text, /Usage/, name);
      assert.match(text, new RegExp(`couch-potator ${name}`), name);
      assert.match(text, /--help/, name);
    }
  });

  it("documents every flag the shell offers", () => {
    for (const name of COMMAND_ORDER) {
      const help = COMMAND_HELP[name];
      assert.ok(help, name);

      const offered = completionCandidates({ current: "--", previous: [name] })
        .filter((flag) => flag.startsWith("--") && flag !== "--root")
        .sort();
      const documented = [
        ...new Set(
          helpOptionsFor(help)
            .flatMap((option) => option.names)
            .filter((flag) => flag.startsWith("--") && flag !== "--root"),
        ),
      ].sort();

      assert.deepEqual(documented, offered, name);
    }
  });
});

describe("help dispatch", () => {
  it("prints the general help for no command, help, --help and -h", async () => {
    for (const argv of [[], ["help"], ["--help"], ["-h"]]) {
      output.clear();
      assert.equal(await run(argv), 0, argv.join(" "));
      assert.match(printed(), /Commands/, argv.join(" "));
    }
  });

  it("answers --help for every command without reading the board", async () => {
    const missing = path.join(root, "missing");
    for (const name of COMMAND_ORDER) {
      if (name === "help") continue;
      output.clear();
      assert.equal(await run([name, "--help", "--root", missing]), 0, name);
      assert.match(printed(), new RegExp(`couch-potator ${name}`), name);
      assert.match(printed(), /Usage/, name);
    }
  });

  it("also answers -h and finds it after positionals", async () => {
    output.clear();
    assert.equal(await run(["show", "-h"]), 0);
    assert.match(printed(), /couch-potator show/);

    output.clear();
    assert.equal(await run(["move", "some-card", "done", "-h"]), 0);
    assert.match(printed(), /couch-potator move/);
  });

  it("answers help <command> and command aliases", async () => {
    output.clear();
    assert.equal(await run(["help", "checks"]), 0);
    assert.match(printed(), /couch-potator checks/);

    output.clear();
    assert.equal(await run(["ls", "--help"]), 0);
    assert.match(printed(), /couch-potator list/);
    assert.match(printed(), /Aliases[\s\S]*ls/);
  });

  it("treats --help after -- as a literal argument", async () => {
    await initCommand(["--root", root, "--no-skill"]);
    output.clear();

    assert.equal(await run(["add", "--root", root, "--", "--help"]), 0);
    assert.equal(scanBoard(root).byId.get("help")?.title, "--help");
  });

  it("reports unknown help targets and unknown commands", async () => {
    assert.equal(await run(["help", "nope"]), 2);
    assert.match(printed(), /Unknown command "nope"/);

    output.clear();
    assert.equal(await run(["nope"]), 2);
    assert.match(printed(), /Unknown command "nope"/);
    assert.match(printed(), /couch-potator help/);
  });
});
