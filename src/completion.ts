import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { INSTALL_TARGETS } from "./agent.js";
import { milestonesOf, scanBoard } from "./board.js";
import { COLUMNS, KINDS } from "./columns.js";
import { CHECK_PHASES, findRoot } from "./config.js";

export const SHELLS = ["bash", "zsh", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

export function isShell(value: string): value is Shell {
  return (SHELLS as readonly string[]).includes(value);
}

/** Maps "sh" to bash; everything else must be a supported shell name. */
export function parseShell(value: string): Shell | null {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (key === "sh") return "bash";
  return isShell(key) ? key : null;
}

export function detectShell(env: NodeJS.ProcessEnv = process.env): Shell | null {
  const name = path.basename(env.SHELL ?? "").toLowerCase();
  if (name.includes("fish")) return "fish";
  if (name.includes("zsh")) return "zsh";
  if (name.includes("bash") || name === "sh") return "bash";
  return null;
}

/**
 * Commands offered at the first word. `__complete` is intentionally absent: it
 * is the internal protocol the shell scripts call.
 */
export const COMMANDS = [
  "init",
  "add",
  "list",
  "ls",
  "show",
  "body",
  "move",
  "mv",
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
  "board",
  "skill",
  "completion",
  "help",
  "version",
] as const;

export const SET_FIELDS = [
  "kind",
  "milestone",
  "priority",
  "order",
  "title",
  "surfaces",
  "blocked_reason",
  "resolution",
  "completed",
] as const;

export const GRAPH_FORMATS = ["text", "mermaid", "dot"] as const;

type ValueSource =
  | "column"
  | "kind"
  | "format"
  | "field"
  | "shell"
  | "card"
  | "milestone"
  | "command"
  | "target";

interface FlagSpec {
  takesValue: boolean;
  source?: ValueSource;
}

const COLUMN_VALUES: string[] = [...COLUMNS];
const KIND_VALUES: string[] = [...KINDS];

const FLAGS: Record<string, Record<string, FlagSpec>> = {
  init: {
    "--name": { takesValue: true },
    "--target": { takesValue: true, source: "target" },
    "--no-skill": { takesValue: false },
    "--force": { takesValue: false },
  },
  add: {
    "-c": { takesValue: true, source: "column" },
    "--column": { takesValue: true, source: "column" },
    "-k": { takesValue: true, source: "kind" },
    "--kind": { takesValue: true, source: "kind" },
    "-m": { takesValue: true, source: "milestone" },
    "--milestone": { takesValue: true, source: "milestone" },
    "-p": { takesValue: true },
    "--priority": { takesValue: true },
    "-o": { takesValue: true },
    "--order": { takesValue: true },
    "-d": { takesValue: true, source: "card" },
    "--depends-on": { takesValue: true, source: "card" },
    "-r": { takesValue: true, source: "card" },
    "--related": { takesValue: true, source: "card" },
    "-s": { takesValue: true },
    "--surface": { takesValue: true },
    "-e": { takesValue: true },
    "--environment": { takesValue: true },
    "-b": { takesValue: true },
    "--body": { takesValue: true },
    "--json": { takesValue: false },
  },
  list: {
    "-c": { takesValue: true, source: "column" },
    "--column": { takesValue: true, source: "column" },
    "-m": { takesValue: true, source: "milestone" },
    "--milestone": { takesValue: true, source: "milestone" },
    "-k": { takesValue: true, source: "kind" },
    "--kind": { takesValue: true, source: "kind" },
    "--all": { takesValue: false },
    "--json": { takesValue: false },
    "--ids": { takesValue: false },
  },
  show: {
    "--json": { takesValue: false },
    "--raw": { takesValue: false },
    "--path": { takesValue: false },
  },
  body: {
    "-f": { takesValue: true },
    "--file": { takesValue: true },
  },
  move: {
    "--top": { takesValue: false },
    "--bottom": { takesValue: false },
    "--before": { takesValue: true, source: "card" },
    "--after": { takesValue: true, source: "card" },
  },
  set: {},
  dep: {},
  rel: {},
  edit: {},
  rm: {
    "-f": { takesValue: false },
    "--force": { takesValue: false },
    "-y": { takesValue: false },
    "--yes": { takesValue: false },
  },
  check: {
    "--json": { takesValue: false },
    "--strict": { takesValue: false },
  },
  checks: {
    "--json": { takesValue: false },
  },
  next: {
    "--parallel": { takesValue: true },
    "--json": { takesValue: false },
  },
  graph: {
    "-f": { takesValue: true, source: "format" },
    "--format": { takesValue: true, source: "format" },
    "-m": { takesValue: true, source: "milestone" },
    "--milestone": { takesValue: true, source: "milestone" },
  },
  view: {
    "-o": { takesValue: true },
    "--out": { takesValue: true },
    "--open": { takesValue: false },
    "--no-open": { takesValue: false },
    "-w": { takesValue: false },
    "--watch": { takesValue: false },
    "-m": { takesValue: true, source: "milestone" },
    "--milestone": { takesValue: true, source: "milestone" },
  },
  skill: {
    "-f": { takesValue: false },
    "--force": { takesValue: false },
    "--target": { takesValue: true, source: "target" },
  },
  completion: {
    "--no-rc": { takesValue: false },
    "--print": { takesValue: false },
  },
};

FLAGS.ls = FLAGS.list ?? {};
FLAGS.mv = FLAGS.move ?? {};
FLAGS.board = FLAGS.view ?? {};
FLAGS.help = {};

const ROOT_FLAG = "--root";

interface BoardValues {
  cards: string[];
  milestones: string[];
}

const boardCache = new Map<string, BoardValues>();

function boardValues(root?: string | null): BoardValues {
  const key = root ?? "";
  const cached = boardCache.get(key);
  if (cached) return cached;

  let values: BoardValues = { cards: [], milestones: [] };
  try {
    const dir = root ?? findRoot();
    if (dir) {
      const board = scanBoard(dir, { lenient: true });
      values = {
        cards: board.cards.map((card) => card.id),
        milestones: milestonesOf(board).map((milestone) => String(milestone)),
      };
    }
  } catch {
    // Completion is best effort: a broken board must never break the shell.
  }

  boardCache.set(key, values);
  return values;
}

function sourceValues(source: ValueSource, root?: string | null): string[] {
  switch (source) {
    case "column":
      return COLUMN_VALUES;
    case "kind":
      return KIND_VALUES;
    case "format":
      return [...GRAPH_FORMATS];
    case "field":
      return [...SET_FIELDS];
    case "shell":
      return [...SHELLS];
    case "target":
      return [...INSTALL_TARGETS];
    case "command":
      return [...COMMANDS];
    case "card":
      return boardValues(root).cards;
    case "milestone":
      return boardValues(root).milestones;
    default:
      return [];
  }
}

function flagsFor(command: string): Record<string, FlagSpec> {
  return FLAGS[command] ?? {};
}

function flagSpec(command: string, name: string): FlagSpec | undefined {
  if (name === ROOT_FLAG) return { takesValue: true };
  return flagsFor(command)[name];
}

function flagNames(command: string): string[] {
  return [...Object.keys(flagsFor(command)), ROOT_FLAG];
}

function filterCandidates(candidates: readonly string[], prefix: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.startsWith(prefix) || seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

interface WordState {
  command: string | null;
  rest: string[];
  root: string | null;
}

/** Skips global flags that may appear before the command. */
function splitLeadingWords(words: string[]): WordState {
  let index = 0;
  let root: string | null = null;

  while (index < words.length) {
    const token = words[index] as string;
    if (token === ROOT_FLAG) {
      root = words[index + 1] ?? null;
      index += 2;
      continue;
    }
    if (token.startsWith(`${ROOT_FLAG}=`)) {
      root = token.slice(ROOT_FLAG.length + 1);
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h" || token === "--version" || token === "-v") {
      index += 1;
      continue;
    }
    break;
  }

  return {
    command: words[index] ?? null,
    rest: words.slice(index + 1),
    root,
  };
}

interface PreviousState {
  positionals: string[];
  /** A value-taking flag at the end of the line, still waiting for its value. */
  pending: string | null;
}

function readPrevious(command: string, words: string[]): PreviousState {
  const positionals: string[] = [];
  let pending: string | null = null;
  let literal = false;

  for (let index = 0; index < words.length; index += 1) {
    const token = words[index] as string;

    if (literal) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      literal = true;
      continue;
    }
    if (token.startsWith("--") && token.includes("=")) continue;
    if (token.startsWith("-") && token !== "-") {
      const spec = flagSpec(command, token);
      if (spec?.takesValue) {
        if (index + 1 < words.length) index += 1;
        else pending = token;
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, pending };
}

/** Returns null when the command has no positional values to offer. */
function positionalCandidates(
  command: string,
  positionals: string[],
  root?: string | null,
): string[] | null {
  const index = positionals.length;

  switch (command) {
    case "move":
    case "mv":
      if (index === 0) return boardValues(root).cards;
      if (index === 1) return COLUMN_VALUES;
      return [];
    case "show":
    case "body":
    case "edit":
    case "rm":
      return index === 0 ? boardValues(root).cards : [];
    case "set": {
      if (index === 0) return boardValues(root).cards;
      if (index === 1) return [...SET_FIELDS];
      const field = positionals[1];
      if (index === 2 && field === "kind") return KIND_VALUES;
      if (index === 2 && field === "milestone") return boardValues(root).milestones;
      return [];
    }
    case "dep":
    case "rel":
      if (index === 0) return ["add", "rm", ...boardValues(root).cards];
      if (index <= 2) return boardValues(root).cards;
      return [];
    case "checks":
      if (index === 0) return ["set", "clear"];
      if (index === 1) return [...CHECK_PHASES];
      return [];
    case "skill":
      return index === 0 ? ["install"] : [];
    case "completion": {
      if (index === 0) return ["install", ...SHELLS];
      if (positionals[0] === "install" && index === 1) return [...SHELLS];
      return [];
    }
    case "help":
      return index === 0 ? [...COMMANDS] : [];
    default:
      return null;
  }
}

export interface CompletionRequest {
  /** Word being completed; may be empty. */
  current: string;
  /** Words after the binary, before `current`. */
  previous: string[];
  /** Project root override; defaults to the nearest board above cwd. */
  root?: string | null;
}

export function completionCandidates(request: CompletionRequest): string[] {
  const current = request.current ?? "";
  const previous = [...(request.previous ?? [])];

  // Value for a leading --root, or an inline --root=...: let the shell do paths.
  if (previous[previous.length - 1] === ROOT_FLAG) return [];
  if (!previous.length && current.startsWith(`${ROOT_FLAG}=`)) return [];

  const { command, rest, root } = splitLeadingWords(previous);
  const projectRoot = root ?? request.root ?? null;

  if (!command) {
    return filterCandidates([...COMMANDS, "--help", "--version"], current);
  }

  const inline = /^(--[a-z0-9-]+)=(.*)$/.exec(current);
  if (inline) {
    const flag = inline[1] as string;
    const prefix = inline[2] as string;
    const spec = flagSpec(command, flag);
    const values = spec?.source ? sourceValues(spec.source, projectRoot) : [];
    return filterCandidates(values, prefix).map((value) => `${flag}=${value}`);
  }

  if (current.startsWith("-")) {
    return filterCandidates(flagNames(command), current);
  }

  const { positionals, pending } = readPrevious(command, rest);
  if (pending) {
    const spec = flagSpec(command, pending);
    const values = spec?.source ? sourceValues(spec.source, projectRoot) : [];
    return filterCandidates(values, current);
  }

  const positional = positionalCandidates(command, positionals, projectRoot);
  if (positional === null) {
    return current === "" ? flagNames(command) : [];
  }
  return filterCandidates(positional, current);
}

// --------------------------------------------------------------- scripts

const BASH_SCRIPT = `# couch-potator shell completion for bash.
# Load it with: source <this file>

_couch_potator_complete() {
    local current="\${COMP_WORDS[COMP_CWORD]}"
    local -a previous=()
    local candidates

    if (( COMP_CWORD > 1 )); then
        previous=("\${COMP_WORDS[@]:1:$((COMP_CWORD - 1))}")
    fi

    candidates="$(couch-potator __complete "--current=$current" -- "\${previous[@]}" 2>/dev/null)"
    if [[ -n "$candidates" ]]; then
        COMPREPLY=($(compgen -W "$candidates" -- "$current"))
    else
        COMPREPLY=()
    fi
}

complete -F _couch_potator_complete couch-potator
`;

const ZSH_SCRIPT = `#compdef couch-potator
# couch-potator shell completion for zsh.
# Load it with: source <this file>

_couch_potator() {
  local output
  local -a candidates previous

  if (( CURRENT > 2 )); then
    previous=("\${words[2,CURRENT-1]}")
  fi

  output="$(couch-potator __complete "--current=\${words[CURRENT]}" -- "\${previous[@]}" 2>/dev/null)"
  if [[ -n $output ]]; then
    candidates=(\${(f)output})
    compadd -- "\${candidates[@]}"
  fi
}

if (( $+functions[compdef] )); then
  compdef _couch_potator couch-potator
else
  autoload -Uz compinit
  compinit
  compdef _couch_potator couch-potator
fi
`;

const FISH_SCRIPT = `# couch-potator shell completion for fish.
# Drop this file in ~/.config/fish/completions/ and fish loads it automatically.

function __couch_potator_arg
    set -l tokens (commandline -opc)
    set -l current (commandline -ct)
    couch-potator __complete "--current=$current" -- $tokens[2..-1] 2>/dev/null
end

function __couch_potator_wants_file
    set -l tokens (commandline -opc)
    set -l previous $tokens[-1]
    if contains -- $previous --body -b --file --root --out
        return 0
    end
    if test (count $tokens) -ge 2; and test "$tokens[2]" = body; and contains -- $previous -f
        return 0
    end
    return 1
end

complete -c couch-potator -f -a '(__couch_potator_arg)'
complete -c couch-potator -F -n '__couch_potator_wants_file'
`;

const SCRIPTS: Record<Shell, string> = {
  bash: BASH_SCRIPT,
  zsh: ZSH_SCRIPT,
  fish: FISH_SCRIPT,
};

export function completionScript(shell: Shell): string {
  return SCRIPTS[shell];
}

// --------------------------------------------------------------- install

const RC_START = "# >>> couch-potator completions >>>";
const RC_END = "# <<< couch-potator completions <<<";

export interface InstallOptions {
  shell: Shell;
  home?: string;
  env?: NodeJS.ProcessEnv;
  /** Write the script, but leave shell startup files alone. */
  skipRc?: boolean;
  /** Report the plan without writing anything. */
  dryRun?: boolean;
}

export interface InstallResult {
  shell: Shell;
  scriptPath: string;
  rcPath: string | null;
  rcUpdated: boolean;
  rcSnippet: string | null;
  written: boolean;
}

function configHome(home: string, env: NodeJS.ProcessEnv): string {
  return env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim()
    ? env.XDG_CONFIG_HOME
    : path.join(home, ".config");
}

function dataHome(home: string, env: NodeJS.ProcessEnv): string {
  return env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim()
    ? env.XDG_DATA_HOME
    : path.join(home, ".local", "share");
}

function rcSnippet(scriptPath: string): string {
  return `${RC_START}\nif [ -r "${scriptPath}" ]; then\n  . "${scriptPath}"\nfi\n${RC_END}\n`;
}

export function installCompletion(options: InstallOptions): InstallResult {
  const home = options.home ?? os.homedir();
  const env = options.env ?? process.env;
  const { shell } = options;

  let scriptPath: string;
  let rcPath: string | null = null;

  if (shell === "fish") {
    scriptPath = path.join(configHome(home, env), "fish", "completions", "couch-potator.fish");
  } else if (shell === "zsh") {
    scriptPath = path.join(configHome(home, env), "couch-potator", "completion.zsh");
    rcPath = path.join(env.ZDOTDIR && env.ZDOTDIR.trim() ? env.ZDOTDIR : home, ".zshrc");
  } else {
    scriptPath = path.join(
      dataHome(home, env),
      "bash-completion",
      "completions",
      "couch-potator",
    );
    rcPath = path.join(home, ".bashrc");
  }

  const snippet = rcPath && !options.skipRc ? rcSnippet(scriptPath) : null;

  if (!options.dryRun) {
    mkdirSync(path.dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, completionScript(shell), "utf8");
  }

  let rcUpdated = false;
  if (!options.dryRun && rcPath && snippet) {
    const existing = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
    if (!existing.includes(RC_START)) {
      const prefix =
        existing === "" || existing.endsWith("\n") ? existing : `${existing}\n`;
      writeFileSync(rcPath, `${prefix}${prefix ? "\n" : ""}${snippet}`, "utf8");
      rcUpdated = true;
    }
  }

  return {
    shell,
    scriptPath,
    rcPath,
    rcUpdated,
    rcSnippet: rcPath ? rcSnippet(scriptPath) : null,
    written: !options.dryRun,
  };
}
