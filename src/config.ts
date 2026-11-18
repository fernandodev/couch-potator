import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";

export const CONFIG_DIR = ".couch-potator";

export const CHECK_PHASES = ["fast", "full"] as const;
export type CheckPhase = (typeof CHECK_PHASES)[number];

/** Named shell commands, grouped by when the implementer runs them. */
export type Checks = Record<CheckPhase, Record<string, string>>;

export interface Config {
  version: 1;
  board: string;
  brief: string;
  viewer: {
    out: string;
  };
  checks: Checks;
}

export const emptyChecks = (): Checks => ({ fast: {}, full: {} });

export const DEFAULT_CONFIG: Config = {
  version: 1,
  board: "board",
  brief: "PROJECT.md",
  viewer: {
    out: `${CONFIG_DIR}/viewer/board.html`,
  },
  checks: emptyChecks(),
};

function normaliseChecks(value: unknown): Checks {
  const checks = emptyChecks();
  if (!value || typeof value !== "object" || Array.isArray(value)) return checks;

  for (const phase of CHECK_PHASES) {
    const group = (value as Record<string, unknown>)[phase];
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    for (const [name, command] of Object.entries(group as Record<string, unknown>)) {
      if (typeof command === "string" && command.trim()) {
        checks[phase][name] = command.trim();
      }
    }
  }
  return checks;
}

export function configPath(root: string): string {
  return path.join(root, CONFIG_DIR, "config.json");
}

export function findRoot(start: string = process.cwd()): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(configPath(dir))) return dir;
    if (existsSync(path.join(dir, CONFIG_DIR)) && existsSync(path.join(dir, "board"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveRoot(explicit?: string): string {
  if (explicit) {
    const root = path.resolve(explicit);
    if (!existsSync(root)) {
      throw new CliError(`No such directory: ${root}`);
    }
    return findRoot(root) ?? root;
  }
  const root = findRoot();
  if (!root) {
    throw new CliError("No couch-potator board found here.", {
      hint: "Run `couch-potator init` first, or point at one with --root <path>.",
    });
  }
  return root;
}

export function loadConfig(root: string): Config {
  const file = configPath(root);
  if (!existsSync(file)) {
    return {
      ...DEFAULT_CONFIG,
      viewer: { ...DEFAULT_CONFIG.viewer },
      checks: emptyChecks(),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new CliError(`Invalid config at ${file}: ${(error as Error).message}`);
  }

  const source = (parsed ?? {}) as Partial<Config>;
  return {
    version: 1,
    board: typeof source.board === "string" && source.board ? source.board : DEFAULT_CONFIG.board,
    brief: typeof source.brief === "string" && source.brief ? source.brief : DEFAULT_CONFIG.brief,
    viewer: {
      out:
        typeof source.viewer?.out === "string" && source.viewer.out
          ? source.viewer.out
          : DEFAULT_CONFIG.viewer.out,
    },
    checks: normaliseChecks(source.checks),
  };
}

export function saveConfig(root: string, config: Config): void {
  writeFileSync(configPath(root), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function boardDir(root: string, config: Config): string {
  return path.resolve(root, config.board);
}

export function briefPath(root: string, config: Config): string {
  return path.resolve(root, config.brief);
}

export function viewerOutPath(root: string, config: Config): string {
  return path.resolve(root, config.viewer.out);
}

export function relativeToRoot(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}
