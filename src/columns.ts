import { UsageError } from "./errors.js";

export const COLUMNS = ["todo", "in-progress", "blocked", "done"] as const;
export type Column = (typeof COLUMNS)[number];

export const COLUMN_LABEL: Record<Column, string> = {
  todo: "Todo",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};

const COLUMN_ALIASES: Record<string, Column> = {
  todo: "todo",
  "to-do": "todo",
  backlog: "todo",
  new: "todo",
  inprogress: "in-progress",
  "in-progress": "in-progress",
  "in_progress": "in-progress",
  wip: "in-progress",
  progress: "in-progress",
  doing: "in-progress",
  active: "in-progress",
  blocked: "blocked",
  block: "blocked",
  stuck: "blocked",
  done: "done",
  complete: "done",
  completed: "done",
  finished: "done",
};

export function isColumn(value: string): value is Column {
  return (COLUMNS as readonly string[]).includes(value);
}

export function resolveColumn(input: string): Column {
  const key = String(input ?? "").trim().toLowerCase();
  const column = COLUMN_ALIASES[key];
  if (!column) {
    throw new UsageError(`Unknown column "${input}".`, {
      hint: `Columns are: ${COLUMNS.map((column) => `${column} (${COLUMN_LABEL[column]})`).join(", ")}.`,
    });
  }
  return column;
}

export const KINDS = [
  "foundation",
  "design",
  "feature",
  "quality",
  "release",
  "fix",
] as const;
export type Kind = (typeof KINDS)[number];

export function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

/** Returns the canonical kind, or null when the value is not one of the known kinds. */
export function normaliseKind(input: string): Kind | null {
  const key = String(input ?? "").trim().toLowerCase();
  return isKind(key) ? key : null;
}

export const DEFAULT_KIND: Kind = "feature";
