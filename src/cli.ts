import { createRequire } from "node:module";
import { bold, cyan, dim, red } from "./ansi.js";
import { addCommand } from "./commands/add.js";
import { bodyCommand } from "./commands/body.js";
import { checkCommand } from "./commands/check.js";
import { checksCommand } from "./commands/checks.js";
import { completeCommand, completionCommand } from "./commands/completion.js";
import { editCommand } from "./commands/edit.js";
import { graphCommand } from "./commands/graph.js";
import { initCommand } from "./commands/init.js";
import { linkCommand } from "./commands/link.js";
import { listCommand } from "./commands/list.js";
import { moveCommand } from "./commands/move.js";
import { nextCommand } from "./commands/next.js";
import { rmCommand } from "./commands/rm.js";
import { setCommand } from "./commands/set.js";
import { showCommand } from "./commands/show.js";
import { skillCommand } from "./commands/skill.js";
import { viewCommand } from "./commands/view.js";
import { CliError, EXIT_INVALID, EXIT_USAGE, UsageError } from "./errors.js";

type Handler = (argv: string[]) => Promise<number>;

const COMMANDS: Record<string, Handler> = {
  init: initCommand,
  add: addCommand,
  list: listCommand,
  ls: listCommand,
  show: showCommand,
  body: bodyCommand,
  move: moveCommand,
  mv: moveCommand,
  set: setCommand,
  dep: (argv) => linkCommand(argv, "dep"),
  rel: (argv) => linkCommand(argv, "rel"),
  edit: editCommand,
  rm: rmCommand,
  check: checkCommand,
  checks: checksCommand,
  next: nextCommand,
  graph: graphCommand,
  view: viewCommand,
  board: viewCommand,
  skill: skillCommand,
  completion: completionCommand,
  __complete: completeCommand,
};

function version(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function help(): void {
  console.log(`${bold("couch-potator")} ${dim(`v${version()}`)}`);
  console.log("A folder-backed spec board with a read-only browser viewer.");
  console.log("");
  console.log(bold("Usage"));
  console.log("  couch-potator <command> [options]");
  console.log("");
  console.log(bold("Commands"));
  const rows: Array<[string, string]> = [
    ["init", "Create board/, PROJECT.md, config and agent scaffolding"],
    ["add", "Create a card (-k kind, -m milestone, -p priority, -s surface)"],
    ["list", "List cards (-c column, -m milestone, --json, --ids)"],
    ["show", "Print a spec (--raw, --path, --json)"],
    ["body", "Replace a spec body: body <card> --file <path|->"],
    ["move", "Move a card: move <card> <column> [--top|--bottom|--before|--after]"],
    ["set", "Set a field: set <card> <field> <value>"],
    ["dep", "Dependencies: dep add|rm <card> <card>, dep <card>"],
    ["rel", "Related links: rel add|rm <card> <card>, rel <card>"],
    ["edit", "Open a spec in $EDITOR"],
    ["rm", "Delete a card (--force)"],
    ["check", "Validate ids, links, cycles and columns"],
    ["checks", "Configure verification commands: set|clear fast|full <name>"],
    ["next", "Pick the next ready cards: --parallel N, --json"],
    ["graph", "Dependency graph: --format text|mermaid|dot"],
    ["view", "Build and open the read-only viewer (--watch, --no-open)"],
    ["skill", "Install the board, planner and unblock skills, /unblock, and AGENTS.md"],
    ["completion", "Print or install shell completions (bash|zsh|fish)"],
  ];
  for (const [name, description] of rows) {
    console.log(`  ${cyan(name.padEnd(10))} ${description}`);
  }
  console.log("");
  console.log(bold("Options"));
  console.log(`  ${cyan("--root <path>")}  Project root (defaults to the nearest board above cwd)`);
  console.log(`  ${cyan("--help")}         This text`);
  console.log(`  ${cyan("--version")}      Version`);
  console.log("");
  console.log(bold("Examples"));
  console.log(dim('  couch-potator init'));
  console.log(dim('  couch-potator add "Reduce cold start" -k feature -m 1'));
  console.log(dim("  couch-potator move reduce-cold-start in-progress"));
  console.log(dim("  couch-potator view"));
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    help();
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(version());
    return 0;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    throw new UsageError(`Unknown command "${command}".`, {
      hint: "Run `couch-potator help` for the command list.",
    });
  }

  return handler(rest);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof CliError) {
      console.error(`${red("couch-potator:")} ${error.message}`);
      for (const detail of error.details ?? []) console.error(`  ${detail}`);
      if (error.hint) console.error(dim(`hint: ${error.hint}`));
      process.exitCode = error.exitCode;
      return;
    }
    if (error instanceof Error) {
      console.error(`${red("couch-potator:")} ${error.message}`);
      process.exitCode = EXIT_INVALID;
      return;
    }
    console.error(`${red("couch-potator:")} ${String(error)}`);
    process.exitCode = EXIT_USAGE;
  });
