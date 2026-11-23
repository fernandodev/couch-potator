import { bold, cyan, dim, table } from "./ansi.js";

export interface HelpOption {
  /** Every spelling of the option, long form last. */
  names: string[];
  /** Placeholder for the value, when the option takes one. */
  value?: string;
  description: string;
}

export interface HelpArgument {
  name: string;
  description: string;
}

export interface HelpAction {
  name: string;
  description: string;
}

export interface CommandHelp {
  name: string;
  summary: string;
  usage: string[];
  arguments?: HelpArgument[];
  options: HelpOption[];
  actions?: HelpAction[];
  aliases?: string[];
  notes?: string[];
  examples?: string[];
  /** Where --root points when it is omitted. Defaults to the nearest board. */
  rootDefault?: "board" | "cwd";
  /** Commands that never read a board do not advertise --root. */
  root?: boolean;
}

export const COMMAND_HELP: Record<string, CommandHelp> = {
  init: {
    name: "init",
    summary: "Scaffold a board, config and agent files",
    usage: ["couch-potator init [options]"],
    options: [
      {
        names: ["--name"],
        value: "name",
        description: "Project name written to PROJECT.md (default: the folder name)",
      },
      {
        names: ["--target"],
        value: "runtime",
        description: "Agent runtime to install: opencode, claude or both (default: opencode)",
      },
      {
        names: ["--no-skill"],
        description: "Skip the agent skills, commands and subagents",
      },
      {
        names: ["--force"],
        description: "Rewrite existing agent files instead of keeping them",
      },
    ],
    notes: ["Idempotent: existing folders, config and PROJECT.md are kept."],
    examples: [
      'couch-potator init --name "Reading List"',
      "couch-potator init --target claude",
      "couch-potator init --target both",
    ],
    rootDefault: "cwd",
  },
  add: {
    name: "add",
    summary: "Create a card",
    usage: ['couch-potator add "<title>" [options]'],
    arguments: [
      { name: "<title>", description: "Card title; the id is derived from it" },
    ],
    options: [
      {
        names: ["-c", "--column"],
        value: "column",
        description: "Target column (default: todo)",
      },
      {
        names: ["-k", "--kind"],
        value: "kind",
        description: "foundation, design, feature, quality, release or fix",
      },
      { names: ["-m", "--milestone"], value: "n", description: "Milestone number" },
      {
        names: ["-p", "--priority"],
        value: "priority",
        description: "must, should or could",
      },
      {
        names: ["-o", "--order"],
        value: "n",
        description: "Sort order within the column",
      },
      {
        names: ["-d", "--depends-on"],
        value: "card",
        description: "Card that must be done first (repeatable)",
      },
      {
        names: ["-r", "--related"],
        value: "card",
        description: "Related card (repeatable)",
      },
      {
        names: ["-s", "--surface"],
        value: "surface",
        description: "UI surface this card changes (repeatable or comma-separated)",
      },
      {
        names: ["-e", "--environment"],
        value: "name",
        description: "Run environment it needs (repeatable or comma-separated)",
      },
      {
        names: ["-b", "--body"],
        value: "file|-",
        description: "Body source; - reads stdin (default: the project card template)",
      },
      { names: ["--json"], description: "Print the new card as JSON" },
    ],
    notes: ["Repeat -d, -r, -s and -e, or pass comma-separated lists to -s and -e."],
    examples: [
      'couch-potator add "Reduce cold start" -k feature -m 1 -p must',
      'couch-potator add "Checkout" -s checkout -d cart',
    ],
  },
  list: {
    name: "list",
    summary: "List cards by column, milestone or kind",
    usage: ["couch-potator list [options]"],
    aliases: ["ls"],
    options: [
      {
        names: ["-c", "--column"],
        value: "column",
        description: "Only show this column",
      },
      {
        names: ["-m", "--milestone"],
        value: "n",
        description: "Only show this milestone",
      },
      { names: ["-k", "--kind"], value: "kind", description: "Only show this kind" },
      { names: ["--all"], description: "Ignore -m and list every milestone" },
      { names: ["--json"], description: "Print cards as JSON" },
      { names: ["--ids"], description: "Print card ids only" },
    ],
    examples: ["couch-potator list -c todo -m 1", "couch-potator list --ids"],
  },
  show: {
    name: "show",
    summary: "Print a card spec",
    usage: ["couch-potator show <card> [options]"],
    arguments: [{ name: "<card>", description: "Card id or unique prefix" }],
    options: [
      { names: ["--json"], description: "Print the card and body as JSON" },
      { names: ["--raw"], description: "Print the raw markdown file" },
      { names: ["--path"], description: "Print the file path" },
    ],
    examples: ["couch-potator show checkout", "couch-potator show checkout --raw"],
  },
  body: {
    name: "body",
    summary: "Replace a card body",
    usage: ["couch-potator body <card> --file <file|->"],
    arguments: [{ name: "<card>", description: "Card id or unique prefix" }],
    options: [
      {
        names: ["-f", "--file"],
        value: "file|-",
        description: "New body; - reads stdin",
      },
    ],
    notes: ["Only the body changes; frontmatter, links and status stay as they are."],
    examples: [
      "couch-potator body checkout --file specs/checkout.md",
      "couch-potator body checkout --file - < specs/checkout.md",
    ],
  },
  move: {
    name: "move",
    summary: "Move a card between columns",
    usage: ["couch-potator move <card> <column> [options]"],
    arguments: [
      { name: "<card>", description: "Card id or unique prefix" },
      { name: "<column>", description: "todo, in-progress, blocked or done" },
    ],
    aliases: ["mv"],
    options: [
      { names: ["--top"], description: "Put the card first in the column" },
      { names: ["--bottom"], description: "Put the card last in the column" },
      {
        names: ["--before"],
        value: "card",
        description: "Put the card just before another card",
      },
      {
        names: ["--after"],
        value: "card",
        description: "Put the card just after another card",
      },
    ],
    notes: [
      "--top/--bottom and --before/--after are mutually exclusive.",
      "Both the source and target columns are renumbered.",
    ],
    examples: ["couch-potator move checkout in-progress --top"],
  },
  set: {
    name: "set",
    summary: "Set or clear a card field",
    usage: ["couch-potator set <card> <field> <value>"],
    arguments: [
      { name: "<card>", description: "Card id or unique prefix" },
      { name: "<field>", description: "Field to change" },
      { name: "<value>", description: "New value; use - to clear an optional field" },
    ],
    options: [],
    notes: [
      "Fields: kind, milestone, priority, order, title, surfaces, environments, blocked_reason, resolution, completed.",
      "surface, environment, env, blocked and reason are aliases. completed accepts today.",
    ],
    examples: [
      'couch-potator set checkout priority must',
      "couch-potator set checkout blocked_reason waiting on design",
      "couch-potator set checkout blocked_reason -",
    ],
  },
  dep: {
    name: "dep",
    summary: "Edit or list dependencies",
    usage: [
      "couch-potator dep add <card> <card>",
      "couch-potator dep rm <card> <card>",
      "couch-potator dep <card>",
    ],
    options: [],
    notes: [
      "add makes the first card wait for the second; rm removes that link.",
      "Cycles are rejected.",
      "dep <card> lists the card's depends_on targets.",
    ],
    examples: ["couch-potator dep add checkout cart", "couch-potator dep checkout"],
  },
  rel: {
    name: "rel",
    summary: "Edit or list related links",
    usage: [
      "couch-potator rel add <card> <card>",
      "couch-potator rel rm <card> <card>",
      "couch-potator rel <card>",
    ],
    options: [],
    notes: [
      "Related links carry no ordering and no cycle check.",
      "Add both directions if you want the link to show on both cards.",
    ],
    examples: ["couch-potator rel add checkout cart", "couch-potator rel checkout"],
  },
  edit: {
    name: "edit",
    summary: "Open a card in $EDITOR",
    usage: ["couch-potator edit <card>"],
    arguments: [{ name: "<card>", description: "Card id or unique prefix" }],
    options: [],
    notes: [
      "Uses $VISUAL, then $EDITOR, then vi (notepad on Windows).",
      "The viewer is regenerated when the editor exits.",
    ],
    examples: ["couch-potator edit checkout"],
  },
  rm: {
    name: "rm",
    summary: "Delete a card",
    usage: ["couch-potator rm <card> [options]"],
    arguments: [{ name: "<card>", description: "Card id or unique prefix" }],
    options: [
      { names: ["-f", "--force"], description: "Delete without asking" },
      { names: ["-y", "--yes"], description: "Alias for --force" },
    ],
    notes: [
      "Without --force or --yes, rm asks for confirmation on a TTY and refuses otherwise.",
    ],
    examples: ["couch-potator rm checkout --force"],
  },
  check: {
    name: "check",
    summary: "Validate the board",
    usage: ["couch-potator check [options]"],
    options: [
      { names: ["--strict"], description: "Fail on warnings too" },
      { names: ["--json"], description: "Print the result as JSON" },
    ],
    notes: [
      "Checks ids, links, cycles, orders, columns, environments and in-progress surface collisions.",
      "Exit code 0 when clean, 1 on errors (or warnings with --strict).",
    ],
    examples: ["couch-potator check", "couch-potator check --strict --json"],
  },
  checks: {
    name: "checks",
    summary: "Show or edit verification commands",
    usage: [
      "couch-potator checks [options]",
      'couch-potator checks set <fast|full> <name> "<command>"',
      "couch-potator checks clear <fast|full> [name]",
    ],
    options: [{ names: ["--json"], description: "Print the configured checks as JSON" }],
    actions: [
      { name: "set", description: "Record or replace a named command for a phase" },
      { name: "clear", description: "Remove one named command, or every command in a phase" },
    ],
    notes: [
      "Fast checks run on every card and after every rebase; full checks run once when the milestone is built.",
      "Names use letters, digits, dots, dashes and underscores.",
      "Run with no action to show the configured checks.",
    ],
    examples: [
      "couch-potator checks",
      'couch-potator checks set fast test "npm test"',
      "couch-potator checks clear full",
    ],
  },
  next: {
    name: "next",
    summary: "Pick the next ready cards",
    usage: ["couch-potator next [options]"],
    options: [
      {
        names: ["--parallel"],
        value: "1-3",
        description: "How many cards may run at once (default: 1)",
      },
      { names: ["--json"], description: "Print the full plan as JSON" },
    ],
    notes: [
      "Reports the batch, held-back, waiting, blocked, in-progress and done cards, plus environment pools.",
      "Exit code 1 when the board has errors.",
    ],
    examples: ["couch-potator next", "couch-potator next --parallel 2"],
  },
  graph: {
    name: "graph",
    summary: "Print the dependency graph",
    usage: ["couch-potator graph [options]"],
    options: [
      {
        names: ["-f", "--format"],
        value: "text|mermaid|dot",
        description: "Output format (default: text)",
      },
      {
        names: ["-m", "--milestone"],
        value: "n|all",
        description: "Only include this milestone",
      },
    ],
    examples: [
      "couch-potator graph",
      "couch-potator graph -m 1 --format mermaid",
      "couch-potator graph --format dot",
    ],
  },
  view: {
    name: "view",
    summary: "Build and open the read-only viewer",
    usage: ["couch-potator view [options]"],
    aliases: ["board"],
    options: [
      {
        names: ["-o", "--out"],
        value: "path",
        description: "Write the page to another path",
      },
      { names: ["--open"], description: "Open the viewer after building (the default)" },
      { names: ["--no-open"], description: "Do not open a browser" },
      { names: ["-w", "--watch"], description: "Rebuild when cards change" },
      {
        names: ["-m", "--milestone"],
        value: "n|all",
        description: "Only include this milestone",
      },
    ],
    notes: [
      "The page is self-contained and read-only.",
      "The project config decides the default output path.",
    ],
    examples: [
      "couch-potator view",
      "couch-potator view --watch",
      "couch-potator view -m 1 --no-open",
    ],
  },
  skill: {
    name: "skill",
    summary: "Install or update the agent skills and subagents",
    usage: ["couch-potator skill [install|update] [options]"],
    options: [
      { names: ["-f", "--force"], description: "Rewrite existing files" },
      {
        names: ["--update"],
        description: "Refresh installed files from this version (same as the update action)",
      },
      {
        names: ["--target"],
        value: "runtime",
        description: "opencode, claude or both (default: opencode)",
      },
    ],
    actions: [
      { name: "install", description: "Install the agent files (the default action)" },
      {
        name: "update",
        description: "Refresh installed files to this version, keeping matching files",
      },
    ],
    notes: [
      "Installs the board, planner, unblock and implement skills, the /unblock and /implement commands, the implementer and integrator subagents, and the managed instruction block.",
      "Update detects the runtimes already installed in the project and rewrites only files whose content changed; pass --target to pick one explicitly.",
    ],
    examples: [
      "couch-potator skill install",
      "couch-potator skill install --target claude --force",
      "couch-potator skill update",
    ],
  },
  completion: {
    name: "completion",
    summary: "Print or install shell completions",
    usage: ["couch-potator completion [install] [bash|zsh|fish] [--print] [--no-rc]"],
    options: [
      {
        names: ["--print"],
        description: "Print the script instead of installing it",
      },
      {
        names: ["--no-rc"],
        description: "Write the script but leave shell startup files alone",
      },
    ],
    notes: [
      "Run with no shell to detect it from $SHELL; sh is treated as bash.",
      "Without install, the script is printed.",
    ],
    examples: [
      "couch-potator completion zsh",
      "couch-potator completion install fish",
    ],
    root: false,
  },
  help: {
    name: "help",
    summary: "Print help for a command",
    usage: ["couch-potator help [command]"],
    arguments: [
      { name: "<command>", description: "Command to describe; omit to list every command" },
    ],
    options: [],
    notes: ["couch-potator <command> --help prints the same text."],
    examples: ["couch-potator help add", "couch-potator add --help"],
    root: false,
  },
  version: {
    name: "version",
    summary: "Print the version",
    usage: ["couch-potator version"],
    options: [],
    notes: ["couch-potator --version and -v print the same value."],
    examples: ["couch-potator version"],
    root: false,
  },
};

/** Commands in the order the top-level help lists them. */
export const COMMAND_ORDER = [
  "init",
  "add",
  "list",
  "show",
  "body",
  "move",
  "set",
  "dep",
  "rel",
  "edit",
  "rm",
  "check",
  "checks",
  "next",
  "graph",
  "view",
  "skill",
  "completion",
  "help",
  "version",
] as const;

export function helpFor(name: string): CommandHelp | undefined {
  return COMMAND_HELP[name];
}

/**
 * The options a command actually renders: its own flags plus the global ones.
 * Exported so tests can keep the help text and the parser in step.
 */
export function helpOptionsFor(help: CommandHelp): HelpOption[] {
  const options = [...help.options];
  if (help.root !== false) {
    options.push({
      names: ["--root"],
      value: "path",
      description:
        help.rootDefault === "cwd"
          ? "Project root (defaults to the current directory)"
          : "Project root (defaults to the nearest board above cwd)",
    });
  }
  options.push({ names: ["-h", "--help"], description: "Print this help" });
  return options;
}

function optionLabel(option: HelpOption): string {
  const value = option.value ? ` <${option.value}>` : "";
  return `${option.names.join(", ")}${value}`;
}

/** Indents every line of a rendered block by two spaces. */
function indent(block: string): string {
  return block
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

export function generalHelpText(version: string): string {
  const width = Math.max(...COMMAND_ORDER.map((name) => name.length));
  const lines = [
    `${bold("couch-potator")} ${dim(`v${version}`)}`,
    "A folder-backed spec board with a read-only browser viewer.",
    "",
    bold("Usage"),
    "  couch-potator <command> [options]",
    "  couch-potator <command> --help",
    "",
    bold("Commands"),
  ];

  for (const name of COMMAND_ORDER) {
    const help = COMMAND_HELP[name];
    if (!help) continue;
    lines.push(`  ${cyan(name.padEnd(width))} ${help.summary}`);
  }

  lines.push(
    "",
    bold("Options"),
    `  ${cyan("--root <path>")}  Project root (defaults to the nearest board above cwd)`,
    `  ${cyan("-h, --help")}     Print this text, or help for one command`,
    `  ${cyan("--version")}      Version`,
    "",
    bold("Examples"),
    dim("  couch-potator init --target claude"),
    dim('  couch-potator add "Reduce cold start" -k feature -m 1'),
    dim("  couch-potator move reduce-cold-start in-progress"),
    dim("  couch-potator view"),
  );

  return lines.join("\n");
}

export function commandHelpText(name: string): string | null {
  const help = helpFor(name);
  if (!help) return null;

  const lines = [`${bold(`couch-potator ${help.name}`)} — ${help.summary}`, "", bold("Usage")];
  for (const usage of help.usage) lines.push(`  ${usage}`);

  if (help.arguments?.length) {
    lines.push("", bold("Arguments"));
    lines.push(indent(table(help.arguments.map((arg) => [cyan(arg.name), arg.description]))));
  }

  if (help.actions?.length) {
    lines.push("", bold("Actions"));
    lines.push(
      indent(table(help.actions.map((action) => [cyan(action.name), action.description]))),
    );
  }

  lines.push(
    "",
    bold("Options"),
    indent(
      table(helpOptionsFor(help).map((option) => [cyan(optionLabel(option)), option.description])),
    ),
  );

  if (help.aliases?.length) {
    lines.push("", bold("Aliases"));
    lines.push(`  ${help.aliases.join(", ")}`);
  }

  if (help.notes?.length) {
    lines.push("", bold("Notes"));
    for (const note of help.notes) lines.push(`  ${note}`);
  }

  if (help.examples?.length) {
    lines.push("", bold("Examples"));
    for (const example of help.examples) lines.push(dim(`  ${example}`));
  }

  lines.push("", dim("Run `couch-potator help` for the command list."));
  return lines.join("\n");
}

export function printGeneralHelp(version: string): void {
  console.log(generalHelpText(version));
}

export function printCommandHelp(name: string): boolean {
  const text = commandHelpText(name);
  if (text === null) return false;
  console.log(text);
  return true;
}
