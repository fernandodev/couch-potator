import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";
import type { Issue } from "./types.js";

export const CONFIG_DIR = ".couch-potator";

export const CHECK_PHASES = ["fast", "full"] as const;
export type CheckPhase = (typeof CHECK_PHASES)[number];

/** Named shell commands, grouped by when the implementer runs them. */
export type Checks = Record<CheckPhase, Record<string, string>>;

/**
 * A runtime a card needs in order to witness its acceptance criteria: a dev
 * server, a desktop window, a simulator, an emulator, a staging service. The
 * name is the project's own word; `concurrency` is how many isolated instances
 * of it may exist at the same time.
 */
export interface Environment {
  concurrency: number;
  /** How to start one isolated instance. Project-specific, shown to agents. */
  hint: string | null;
}

export type Environments = Record<string, Environment>;

export interface Config {
  version: 1;
  board: string;
  brief: string;
  viewer: {
    out: string;
  };
  checks: Checks;
  environments: Environments;
  /** Environment used when a visible card does not name one. */
  defaultEnvironment: string | null;
}

export const emptyChecks = (): Checks => ({ fast: {}, full: {} });
export const emptyEnvironments = (): Environments => ({});

export const DEFAULT_CONFIG: Config = {
  version: 1,
  board: "board",
  brief: "PROJECT.md",
  viewer: {
    out: `${CONFIG_DIR}/viewer/board.html`,
  },
  checks: emptyChecks(),
  environments: emptyEnvironments(),
  defaultEnvironment: null,
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

function normaliseEnvironments(value: unknown): Environments {
  const environments = emptyEnvironments();
  if (!value || typeof value !== "object" || Array.isArray(value)) return environments;

  for (const [rawName, rawEnvironment] of Object.entries(value as Record<string, unknown>)) {
    const name = rawName.trim();
    if (!name) continue;

    const source =
      rawEnvironment && typeof rawEnvironment === "object" && !Array.isArray(rawEnvironment)
        ? (rawEnvironment as Record<string, unknown>)
        : {};
    const rawConcurrency = source.concurrency;
    const concurrency =
      typeof rawConcurrency === "number" && Number.isInteger(rawConcurrency) && rawConcurrency > 0
        ? rawConcurrency
        : 1;

    environments[name] = {
      concurrency,
      hint: typeof source.hint === "string" && source.hint.trim() ? source.hint.trim() : null,
    };
  }
  return environments;
}

const ENVIRONMENT_NAME = /^[a-z0-9][a-z0-9_-]*$/i;

/** Problems in the config itself, reported by `couch-potator check`. */
export function configIssues(config: Config): Issue[] {
  const issues: Issue[] = [];
  const names = Object.keys(config.environments);

  for (const name of names) {
    if (!ENVIRONMENT_NAME.test(name)) {
      issues.push({
        level: "warning",
        message: `Environment "${name}" should be a short lowercase name such as browser or ios-sim.`,
        file: `${CONFIG_DIR}/config.json`,
      });
    }
  }

  if (config.defaultEnvironment && !config.environments[config.defaultEnvironment]) {
    issues.push({
      level: "warning",
      message: `default_environment "${config.defaultEnvironment}" is not declared under environments.`,
      file: `${CONFIG_DIR}/config.json`,
    });
  }

  if (names.length > 1 && !config.defaultEnvironment) {
    issues.push({
      level: "warning",
      message:
        "More than one environment is declared but default_environment is not set; cards with surfaces must name one.",
      file: `${CONFIG_DIR}/config.json`,
    });
  }

  return issues;
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
      environments: emptyEnvironments(),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new CliError(`Invalid config at ${file}: ${(error as Error).message}`);
  }

  const source = (parsed ?? {}) as Record<string, unknown>;
  const rawDefault = source.default_environment ?? source.defaultEnvironment;
  const defaultEnvironment =
    typeof rawDefault === "string" && rawDefault.trim() ? rawDefault.trim() : null;
  const viewer =
    source.viewer && typeof source.viewer === "object" && !Array.isArray(source.viewer)
      ? (source.viewer as Record<string, unknown>)
      : {};

  return {
    version: 1,
    board: typeof source.board === "string" && source.board ? source.board : DEFAULT_CONFIG.board,
    brief: typeof source.brief === "string" && source.brief ? source.brief : DEFAULT_CONFIG.brief,
    viewer: {
      out:
        typeof viewer.out === "string" && viewer.out ? viewer.out : DEFAULT_CONFIG.viewer.out,
    },
    checks: normaliseChecks(source.checks),
    environments: normaliseEnvironments(source.environments),
    defaultEnvironment,
  };
}

export function saveConfig(root: string, config: Config): void {
  const { defaultEnvironment, ...rest } = config;
  const json = {
    ...rest,
    ...(defaultEnvironment ? { default_environment: defaultEnvironment } : {}),
  };
  writeFileSync(configPath(root), `${JSON.stringify(json, null, 2)}\n`, "utf8");
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
