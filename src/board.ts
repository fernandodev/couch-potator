import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  COLUMNS,
  type Column,
} from "./columns.js";
import { readCard, type Card } from "./card.js";
import { boardDir, briefPath, configIssues, loadConfig, relativeToRoot, type Config } from "./config.js";
import { CliError, UsageError } from "./errors.js";
import { parseMarkdown, type Frontmatter } from "./frontmatter.js";
import { slugify } from "./slug.js";
import type { Issue } from "./types.js";

export interface Brief {
  path: string;
  exists: boolean;
  data: Frontmatter;
  body: string;
  name: string;
  currentMilestone: number | null;
  milestones: number[];
}

export interface Board {
  root: string;
  config: Config;
  cards: Card[];
  byId: Map<string, Card>;
  brief: Brief;
  issues: Issue[];
}

export interface ScanOptions {
  lenient?: boolean;
}

function readBrief(root: string, config: Config): Brief {
  const file = briefPath(root, config);
  const fallback: Brief = {
    path: file,
    exists: false,
    data: {},
    body: "",
    name: path.basename(root),
    currentMilestone: null,
    milestones: [],
  };
  if (!existsSync(file)) return fallback;

  const parsed = parseMarkdown(readFileSync(file, "utf8"));
  const name =
    typeof parsed.data.name === "string" && parsed.data.name.trim()
      ? parsed.data.name.trim()
      : path.basename(root);
  const current =
    typeof parsed.data.current_milestone === "number"
      ? parsed.data.current_milestone
      : typeof parsed.data.current_milestone === "string" &&
          /^\d+$/.test(parsed.data.current_milestone.trim())
        ? Number(parsed.data.current_milestone.trim())
        : null;
  const declared = Array.isArray(parsed.data.milestones)
    ? parsed.data.milestones
        .map((value) =>
          typeof value === "number"
            ? value
            : typeof value === "string" && /^\d+$/.test(value.trim())
              ? Number(value.trim())
              : null,
        )
        .filter((value): value is number => value != null)
    : [];

  return {
    path: file,
    exists: true,
    data: parsed.data,
    body: parsed.body,
    name,
    currentMilestone: current,
    milestones: declared,
  };
}

export function scanBoard(root: string, options: ScanOptions = {}): Board {
  const config = loadConfig(root);
  const dir = boardDir(root, config);
  const issues: Issue[] = [...configIssues(config)];
  const cards: Card[] = [];

  if (!existsSync(dir)) {
    const message = `Board folder missing: ${relativeToRoot(root, dir)}`;
    if (!options.lenient) {
      throw new CliError(message, { hint: "Run `couch-potator init` to create it." });
    }
    issues.push({ level: "error", message });
  } else {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !(COLUMNS as readonly string[]).includes(entry.name)) {
        issues.push({
          level: "warning",
          message: `Ignoring folder ${relativeToRoot(root, path.join(dir, entry.name))}: the board has exactly todo, in-progress, blocked and done.`,
        });
      } else if (entry.isFile()) {
        issues.push({
          level: "warning",
          message: `Ignoring ${relativeToRoot(root, path.join(dir, entry.name))}: cards live inside a column folder.`,
        });
      }
    }
  }

  for (const column of COLUMNS) {
    const columnDir = path.join(dir, column);
    if (!existsSync(columnDir)) {
      issues.push({ level: "warning", message: `Missing column folder: ${relativeToRoot(root, columnDir)}` });
      continue;
    }

    const files = readdirSync(columnDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.join(columnDir, entry.name))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      try {
        cards.push(readCard(file, root, column));
      } catch (error) {
        const message = (error as Error).message;
        if (!options.lenient) throw new CliError(message);
        issues.push({ level: "error", message });
      }
    }
  }

  const byId = new Map<string, Card>();
  for (const card of cards) {
    if (!byId.has(card.id)) byId.set(card.id, card);
  }

  return {
    root,
    config,
    cards: sortCards(cards),
    byId,
    brief: readBrief(root, config),
    issues,
  };
}

const statusIndex = (column: Column): number => (COLUMNS as readonly string[]).indexOf(column);

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => {
    const status = statusIndex(left.status) - statusIndex(right.status);
    if (status !== 0) return status;
    const order = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
    if (order !== 0) return order;
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}

export function cardsInColumn(board: Board, column: Column): Card[] {
  return sortCards(board.cards.filter((card) => card.status === column));
}

export function resolveCard(board: Board, reference: string): Card {
  const needle = String(reference ?? "").trim().replace(/\.md$/, "");
  if (!needle) throw new UsageError("No card given.");

  const exact = board.byId.get(needle);
  if (exact) return exact;

  const pooled = new Map<string, Card>();
  for (const card of board.cards) {
    if (card.id.startsWith(needle) || card.id.includes(needle)) pooled.set(card.id, card);
  }
  const matches = [...pooled.values()];

  if (matches.length === 1 && matches[0]) return matches[0];
  if (matches.length === 0) {
    throw new UsageError(`No card called "${reference}".`, {
      details: board.cards.length
        ? board.cards.map((card) => `${card.id}  ${card.title}`)
        : ["The board is empty."],
      hint: board.cards.length ? "Cards from the board are listed above." : undefined,
    });
  }
  throw new UsageError(`"${reference}" is ambiguous.`, {
    details: matches.map((card) => `${card.id}  ${card.title}`),
  });
}

export function nextOrder(cards: Card[]): number {
  const highest = cards.reduce((max, card) => Math.max(max, card.order ?? 0), 0);
  return highest + 10;
}

export function milestonesOf(board: Board): number[] {
  const values = new Set<number>(board.brief.milestones);
  if (board.brief.currentMilestone != null) values.add(board.brief.currentMilestone);
  for (const card of board.cards) if (card.milestone != null) values.add(card.milestone);
  return [...values].sort((a, b) => a - b);
}

export function projectSlug(root: string): string {
  return slugify(path.basename(root));
}
