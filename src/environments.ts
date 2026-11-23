import type { Card } from "./card.js";
import type { Config } from "./config.js";

/** Used when a project never declared an environment but has visible cards. */
export const IMPLICIT_ENVIRONMENT = "app";

export interface EnvironmentUsage {
  /** How many isolated instances the project allows at the same time. */
  concurrency: number;
  /** How many in-progress cards need this environment. */
  in_use: number;
  /** How many instances are free right now. */
  free: number;
  /** How to start one isolated instance, when the project said so. */
  hint: string | null;
}

const declared = (config: Config): string[] => Object.keys(config.environments);

/**
 * The environments a card needs to witness its acceptance criteria.
 *
 * Cards without surfaces and without an explicit environment need no runtime:
 * unit tests do not start a server, a window or a simulator. Visible cards fall
 * back to the project default, then to the only declared environment, then to
 * one implicit `app` slot, which is the old behaviour and stays safe.
 */
export function environmentsForCard(
  card: Pick<Card, "environments" | "surfaces">,
  config: Config,
): string[] {
  if (card.environments.length) return card.environments;
  if (!card.surfaces.length) return [];

  if (config.defaultEnvironment && config.environments[config.defaultEnvironment]) {
    return [config.defaultEnvironment];
  }

  const names = declared(config);
  if (names.length === 1 && names[0]) return [names[0]];
  if (!names.length) return [IMPLICIT_ENVIRONMENT];
  return [];
}

/**
 * True when a visible card cannot be matched to an environment. The card still
 * runs, alone, but the planner should name one or set `default_environment`.
 */
export function environmentIsAmbiguous(
  card: Pick<Card, "environments" | "surfaces">,
  config: Config,
): boolean {
  return (
    !card.environments.length &&
    card.surfaces.length > 0 &&
    !config.defaultEnvironment &&
    declared(config).length > 1
  );
}

/**
 * The environment pools for a run, including how many instances are already
 * held by cards in progress.
 *
 * Concurrency limits *witnessing*, not the batch width. Two cards that touch
 * different surfaces can be built at the same time even when the project only
 * allows one instance of its app; their checks queue behind that one slot.
 */
export function environmentUsage(
  config: Config,
  inProgress: Card[],
): Record<string, EnvironmentUsage> {
  const needed = inProgress.map((card) => environmentsForCard(card, config));
  const names = new Set<string>([...declared(config), ...needed.flat()]);

  const usage: Record<string, EnvironmentUsage> = {};
  for (const name of names) {
    const concurrency = config.environments[name]?.concurrency ?? 1;
    const inUse = needed.filter((card) => card.includes(name)).length;
    usage[name] = {
      concurrency,
      in_use: inUse,
      free: Math.max(0, concurrency - inUse),
      hint: config.environments[name]?.hint ?? null,
    };
  }
  return usage;
}

/** `browser 1/3 in use` — a compact line for `next`. */
export function environmentLine(name: string, usage: EnvironmentUsage): string {
  const state =
    usage.concurrency === 1
      ? usage.in_use
        ? "busy"
        : "free"
      : `${usage.in_use}/${usage.concurrency} in use`;
  return `${name} — ${state}`;
}
