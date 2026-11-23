import { createRequire } from "node:module";
import { dim, red } from "./ansi.js";
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
import { printCommandHelp, printGeneralHelp } from "./help.js";

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

const ALIASES: Record<string, string> = {
  ls: "list",
  mv: "move",
  board: "view",
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

/** The canonical name behind an alias, or the name itself. */
function canonical(name: string): string {
  return ALIASES[name] ?? name;
}

/**
 * Where `--help` or `-h` asks for help, ignoring tokens after `--` because
 * those are literal arguments, such as a card title.
 */
function helpIndex(args: string[]): number {
  const end = args.indexOf("--");
  const words = end === -1 ? args : args.slice(0, end);
  return words.findIndex((word) => word === "--help" || word === "-h");
}

function unknownCommand(name: string): UsageError {
  return new UsageError(`Unknown command "${name}".`, {
    hint: "Run `couch-potator help` for the command list.",
  });
}

/** Prints help for `name`; throws when there is no such command. */
function showCommandHelp(name: string): void {
  if (printCommandHelp(canonical(name))) return;
  throw unknownCommand(name);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command) {
    printGeneralHelp(version());
    return 0;
  }

  if (command === "help") {
    const target = rest[0];
    if (!target || target === "--help" || target === "-h") {
      printGeneralHelp(version());
      return 0;
    }
    showCommandHelp(target);
    return 0;
  }

  if (command === "--help" || command === "-h") {
    printGeneralHelp(version());
    return 0;
  }
  if (command === "--version" || command === "-v") {
    console.log(version());
    return 0;
  }
  if (command === "version") {
    if (helpIndex(rest) !== -1) {
      showCommandHelp("version");
      return 0;
    }
    console.log(version());
    return 0;
  }

  const handler = COMMANDS[command];
  if (!handler) throw unknownCommand(command);

  if (helpIndex(rest) !== -1) {
    showCommandHelp(command);
    return 0;
  }

  return handler(rest);
}

/**
 * Runs the CLI and renders any failure the way the binary reports it. Exported
 * so tests can exercise argument handling without spawning a child process.
 */
export async function run(argv: string[]): Promise<number> {
  try {
    return await main(argv);
  } catch (error: unknown) {
    if (error instanceof CliError) {
      console.error(`${red("couch-potator:")} ${error.message}`);
      for (const detail of error.details ?? []) console.error(`  ${detail}`);
      if (error.hint) console.error(dim(`hint: ${error.hint}`));
      return error.exitCode;
    }
    if (error instanceof Error) {
      console.error(`${red("couch-potator:")} ${error.message}`);
      return EXIT_INVALID;
    }
    console.error(`${red("couch-potator:")} ${String(error)}`);
    return EXIT_USAGE;
  }
}
