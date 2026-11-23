import { blue, bold, dim, green, red } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { projectSlug, scanBoard } from "../board.js";
import type { Card } from "../card.js";
import { COLUMN_LABEL, type Column } from "../columns.js";
import { relativeToRoot, resolveRoot, type Config } from "../config.js";
import {
  environmentLine,
  environmentUsage,
  environmentsForCard,
  type EnvironmentUsage,
} from "../environments.js";
import { UsageError } from "../errors.js";
import { plural } from "../log.js";
import { countIssues } from "../types.js";
import { validateBoard } from "../validate.js";

const OPTIONS = {
  parallel: { type: "string" as const },
  json: { type: "boolean" as const },
  root: ROOT_OPTION,
};

const MIN_PARALLEL = 1;
const MAX_PARALLEL = 3;

const PRIORITY_RANK: Record<string, number> = { must: 0, should: 1, could: 2 };
const KIND_RANK: Record<string, number> = {
  foundation: 0,
  feature: 1,
  design: 2,
  quality: 3,
  fix: 4,
  release: 5,
};

export interface SpecSummary {
  id: string;
  title: string;
  kind: string;
  priority: string;
  milestone: number | null;
  status: Column;
  order: number | null;
  depends_on: string[];
  surfaces: string[];
  environments: string[];
  file: string;
}

export interface WaitingSpec extends SpecSummary {
  unresolved_deps: Array<{ id: string; status: string; title: string }>;
}

export interface HeldBackSpec extends SpecSummary {
  reason: string;
}

export interface NextBatch {
  project: {
    name: string;
    slug: string;
    status: string;
    current_milestone: number | null;
    brief_path: string;
    root: string;
  };
  counts: Record<Column, number>;
  milestone: {
    current: number | null;
    counts: Record<Column, number>;
  };
  parallel: number;
  slots: number;
  /** Environment pools and how many instances are already held. */
  environments: Record<string, EnvironmentUsage>;
  next: SpecSummary | null;
  batch: SpecSummary[];
  held_back: HeldBackSpec[];
  eligible: SpecSummary[];
  waiting: WaitingSpec[];
  blocked: Array<SpecSummary & { blocked_reason: string | null }>;
  in_progress: SpecSummary[];
  done: SpecSummary[];
  out_of_milestone: number;
  errors: string[];
  warnings: string[];
}

function priorityOf(card: Card): string {
  return card.priority?.trim().toLowerCase() || "should";
}

function rank(table: Record<string, number>, value: string, fallback: number): number {
  return table[value] ?? fallback;
}

function compareCards(left: Card, right: Card): number {
  const priority = rank(PRIORITY_RANK, priorityOf(left), 1) - rank(PRIORITY_RANK, priorityOf(right), 1);
  if (priority !== 0) return priority;

  const order =
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
  if (order !== 0) return order;

  const kind = rank(KIND_RANK, left.kind, 6) - rank(KIND_RANK, right.kind, 6);
  if (kind !== 0) return kind;

  return left.id.localeCompare(right.id);
}

function summary(card: Card, config: Config): SpecSummary {
  return {
    id: card.id,
    title: card.title,
    kind: card.kind,
    priority: priorityOf(card),
    milestone: card.milestone,
    status: card.status,
    order: card.order,
    depends_on: card.dependsOn,
    surfaces: card.surfaces,
    environments: environmentsForCard(card, config),
    file: card.relFile,
  };
}

/**
 * Why `card` must not run beside the cards already taken. A card with no
 * surfaces is unknown, so it may only run alone.
 */
function surfaceConflict(card: Card, taken: Card[]): string | null {
  for (const other of taken) {
    const shared = [...new Set(card.surfaces.filter((surface) => other.surfaces.includes(surface)))].sort();
    if (shared.length) return `shares ${shared.join(", ")} with ${other.id}`;
    if (!card.surfaces.length) {
      return "does not declare surfaces; add them to run it alongside another card";
    }
    if (!other.surfaces.length) {
      return `${other.id} does not declare surfaces, so this cannot be proven separate from it`;
    }
  }
  return null;
}

function chooseBatch(
  eligible: Card[],
  slots: number,
  inProgress: Card[],
  config: Config,
): { batch: Card[]; heldBack: HeldBackSpec[] } {
  const batch: Card[] = [];
  const heldBack: HeldBackSpec[] = [];
  const taken = [...inProgress];

  for (const card of eligible) {
    const conflict = surfaceConflict(card, taken);
    if (conflict) {
      heldBack.push({ ...summary(card, config), reason: conflict });
      continue;
    }
    if (slots <= 0) {
      heldBack.push({ ...summary(card, config), reason: "no free slot in this run" });
      continue;
    }
    if (batch.length >= slots) {
      heldBack.push({ ...summary(card, config), reason: "beyond the parallel limit" });
      continue;
    }
    batch.push(card);
    taken.push(card);
  }

  return { batch, heldBack };
}

function emptyCounts(): Record<Column, number> {
  return { todo: 0, "in-progress": 0, blocked: 0, done: 0 };
}

function countCards(cards: Card[]): Record<Column, number> {
  const counts = emptyCounts();
  for (const card of cards) counts[card.status] += 1;
  return counts;
}

function statusTag(column: Column): string {
  const label = COLUMN_LABEL[column];
  if (column === "done") return green(label);
  if (column === "blocked") return red(label);
  if (column === "in-progress") return blue(label);
  return dim(label);
}

export function analyseNext(root: string, parallel: number): NextBatch {
  const board = scanBoard(root, { lenient: true });
  const issues = validateBoard(board);
  const counts = countIssues(issues);
  const errors = issues.filter((issue) => issue.level === "error").map((issue) => issue.message);
  const warnings = issues.filter((issue) => issue.level === "warning").map((issue) => issue.message);

  const current = board.brief.currentMilestone;
  if (current == null) {
    errors.push("PROJECT.md has no current_milestone in its frontmatter.");
  }

  const inProgress = board.cards.filter((card) => card.status === "in-progress");
  const doneIds = new Set(board.cards.filter((card) => card.status === "done").map((card) => card.id));

  if (inProgress.length > parallel) {
    warnings.push(
      `${plural(inProgress.length, "card")} in progress but the parallel limit is ${parallel} (${inProgress
        .map((card) => card.id)
        .join(", ")}). They are resumed before any new work starts.`,
    );
  }
  for (const card of inProgress) {
    if (current != null && card.milestone !== current) {
      warnings.push(
        `${card.id} is in progress in milestone ${card.milestone ?? "none"}; the current milestone is ${current}.`,
      );
    }
  }

  const eligible: Card[] = [];
  const waiting: WaitingSpec[] = [];

  if (current != null) {
    const todo = board.cards
      .filter((card) => card.status === "todo" && card.milestone === current)
      .sort(compareCards);

    for (const card of todo) {
      if (card.blockedReason) {
        warnings.push(
          `${card.id} has a blocked_reason but sits in todo/; move it to blocked/ or clear the reason.`,
        );
        continue;
      }

      const unresolved = card.dependsOn.filter((dependency) => !doneIds.has(dependency));
      if (unresolved.length) {
        waiting.push({
          ...summary(card, board.config),
          unresolved_deps: unresolved.map((dependency) => {
            const dependencyCard = board.byId.get(dependency);
            return {
              id: dependency,
              status: dependencyCard?.status ?? "missing",
              title: dependencyCard?.title ?? "",
            };
          }),
        });
      } else {
        eligible.push(card);
      }
    }
  }

  for (const card of board.cards) {
    if (card.status !== "todo" || card.milestone !== current) continue;
    if (!card.priority) {
      warnings.push(`${card.id}: missing priority; treated as "should".`);
    } else if (!(card.priority.toLowerCase() in PRIORITY_RANK)) {
      warnings.push(`${card.id}: unknown priority "${card.priority}"; treated as "should".`);
    }
  }

  const slots = Math.max(0, parallel - inProgress.length);
  const { batch, heldBack } = chooseBatch(eligible, slots, inProgress, board.config);
  const environments = environmentUsage(board.config, inProgress);

  if (board.brief.exists) {
    const status = board.brief.data.status;
    if (typeof status === "string" && status.trim() && status.trim() !== "active") {
      warnings.push(`Project status is "${status.trim()}"; expected "active".`);
    }
  }

  const milestoneCounts =
    current == null ? emptyCounts() : countCards(board.cards.filter((card) => card.milestone === current));

  return {
    project: {
      name: board.brief.name,
      slug: projectSlug(root),
      status:
        typeof board.brief.data.status === "string" && board.brief.data.status.trim()
          ? board.brief.data.status.trim()
          : "active",
      current_milestone: current,
      brief_path: board.brief.exists ? relativeToRoot(root, board.brief.path) : "",
      root,
    },
    counts: countCards(board.cards),
    milestone: {
      current,
      counts: milestoneCounts,
    },
    parallel,
    slots,
    environments,
    next: eligible[0] ? summary(eligible[0], board.config) : null,
    batch: batch.map((card) => summary(card, board.config)),
    held_back: heldBack,
    eligible: eligible.map((card) => summary(card, board.config)),
    waiting,
    blocked: board.cards
      .filter((card) => card.status === "blocked" && card.milestone === current)
      .map((card) => ({ ...summary(card, board.config), blocked_reason: card.blockedReason })),
    in_progress: inProgress.map((card) => summary(card, board.config)),
    done: board.cards
      .filter((card) => card.status === "done" && card.milestone === current)
      .map((card) => summary(card, board.config)),
    out_of_milestone: board.cards.filter((card) => card.milestone !== current).length,
    errors,
    warnings,
  };
}

function specLine(spec: SpecSummary): string {
  const surfaces = spec.surfaces.length ? ` [${spec.surfaces.join(", ")}]` : "";
  const environments = spec.environments.length
    ? ` ${dim(`env: ${spec.environments.join(", ")}`)}`
    : "";
  return `- ${bold(spec.id)} — ${spec.title} (${spec.priority})${surfaces}${environments}`;
}

function section(title: string, lines: string[]): void {
  console.log("");
  console.log(bold(title));
  if (!lines.length) {
    console.log(dim("- none"));
    return;
  }
  for (const line of lines) console.log(line);
}

export async function nextCommand(argv: string[]): Promise<number> {
  const { values } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));

  const rawParallel = text(values, "parallel") ?? String(MIN_PARALLEL);
  const requested = Number(rawParallel);
  if (!Number.isInteger(requested) || requested < MIN_PARALLEL) {
    throw new UsageError(`--parallel must be at least ${MIN_PARALLEL}.`, {
      details: [`Got "${rawParallel}".`],
    });
  }

  const parallel = Math.min(requested, MAX_PARALLEL);
  const result = analyseNext(root, parallel);
  if (requested > MAX_PARALLEL) {
    result.warnings.push(`--parallel ${requested} is above the cap; using ${MAX_PARALLEL}.`);
  }

  if (flag(values, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return result.errors.length ? 1 : 0;
  }

  console.log(
    `${bold(result.project.name)} ${dim(`— milestone ${result.milestone.current ?? "?"}`)}`,
  );
  console.log(
    `Milestone: ${result.milestone.counts.done} done · ${result.milestone.counts["in-progress"]} in progress · ${result.milestone.counts.blocked} blocked · ${result.milestone.counts.todo} todo`,
  );
  console.log(`Parallel: ${result.parallel} slot(s), ${result.slots} free`);

  const pools = Object.entries(result.environments);
  if (pools.length) {
    console.log(
      `Environments: ${pools
        .map(([name, usage]) => environmentLine(name, usage))
        .join(" · ")} ${dim("(witness width, not work width)")}`,
    );
  }

  if (result.next) {
    console.log(`Next: ${bold(result.next.id)} — ${result.next.title} (${result.next.priority})`);
  } else {
    console.log("Next: none");
  }

  section(
    `Batch (${result.batch.length} of ${result.slots} free slot(s))`,
    result.batch.map(specLine),
  );

  section(
    "Held back",
    result.held_back.map((spec) => `- ${bold(spec.id)} — ${spec.reason}`),
  );

  section(
    "Waiting",
    result.waiting.map((spec) => {
      const deps = spec.unresolved_deps
        .map((dependency) => `${dependency.id} (${dependency.status})`)
        .join(", ");
      return `- ${bold(spec.id)} — ${spec.title}; waiting on ${deps}`;
    }),
  );

  section(
    "Blocked",
    result.blocked.map((spec) => {
      const reason = spec.blocked_reason ? `; ${spec.blocked_reason}` : "";
      return `- ${bold(spec.id)} — ${spec.title}${reason}`;
    }),
  );

  section(
    "In progress",
    result.in_progress.map(
      (spec) => `- ${statusTag(spec.status)} ${bold(spec.id)} — ${spec.title}`,
    ),
  );

  section(
    "Done",
    result.done.map((spec) => `- ${bold(spec.id)} — ${spec.title}`),
  );

  if (result.out_of_milestone) {
    console.log("");
    console.log(dim(`Other milestones: ${result.out_of_milestone} card(s), left untouched.`));
  }

  if (result.warnings.length) {
    section(
      "Warnings",
      result.warnings.map((warning) => `- ${warning}`),
    );
  }

  if (result.errors.length) {
    section(
      "Errors",
      result.errors.map((error) => `- ${red(error)}`),
    );
  }

  return result.errors.length ? 1 : 0;
}
