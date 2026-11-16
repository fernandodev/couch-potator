import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_KIND, isKind, type Column } from "./columns.js";
import { relativeToRoot } from "./config.js";
import { parseMarkdown, stringifyMarkdown, type Frontmatter } from "./frontmatter.js";

export interface Card {
  id: string;
  declaredId: string | null;
  title: string;
  kind: string;
  kindKnown: boolean;
  status: Column;
  milestone: number | null;
  priority: string | null;
  order: number | null;
  dependsOn: string[];
  related: string[];
  blockedReason: string | null;
  completed: string | null;
  resolution: string | null;
  created: string | null;
  updated: string | null;
  body: string;
  /** Absolute path on disk. */
  file: string;
  /** Path relative to the project root, with forward slashes. */
  relFile: string;
  /** Raw frontmatter, so unknown keys survive a round trip. */
  data: Frontmatter;
}

export const today = (): string => new Date().toISOString().slice(0, 10);

const asString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
};

const asArray = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const text = asString(item);
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
};

export function readCard(file: string, root: string, status: Column): Card {
  const raw = readFileSync(file, "utf8");
  let parsed: ReturnType<typeof parseMarkdown>;
  try {
    parsed = parseMarkdown(raw);
  } catch (error) {
    throw new Error(`${relativeToRoot(root, file)}: ${(error as Error).message}`);
  }

  const { data, body } = parsed;
  const declaredId = asString(data.id);
  const id = path.basename(file, ".md");
  const rawKind = asString(data.kind);
  const kind = rawKind ? rawKind.toLowerCase() : DEFAULT_KIND;

  return {
    id,
    declaredId,
    title: asString(data.title) ?? path.basename(file, ".md"),
    kind,
    kindKnown: isKind(kind),
    status,
    milestone: asNumber(data.milestone),
    priority: asString(data.priority),
    order: asNumber(data.order),
    dependsOn: asArray(data.depends_on),
    related: asArray(data.related),
    blockedReason: asString(data.blocked_reason),
    completed: asString(data.completed),
    resolution: asString(data.resolution),
    created: asString(data.created),
    updated: asString(data.updated),
    body,
    file,
    relFile: relativeToRoot(root, file),
    data,
  };
}

function setOrDelete(data: Frontmatter, key: string, value: unknown): void {
  if (value === null || value === undefined) {
    delete data[key];
    return;
  }
  if (Array.isArray(value) && value.length === 0) {
    delete data[key];
    return;
  }
  data[key] = value;
}

export function cardData(card: Card): Frontmatter {
  const data: Frontmatter = { ...card.data };
  delete data.status;

  setOrDelete(data, "id", card.id);
  setOrDelete(data, "title", card.title);
  setOrDelete(data, "kind", card.kind);
  setOrDelete(data, "milestone", card.milestone);
  setOrDelete(data, "priority", card.priority);
  setOrDelete(data, "order", card.order);
  setOrDelete(data, "depends_on", card.dependsOn);
  setOrDelete(data, "related", card.related);
  setOrDelete(data, "blocked_reason", card.blockedReason);
  setOrDelete(data, "completed", card.completed);
  setOrDelete(data, "resolution", card.resolution);
  setOrDelete(data, "created", card.created);
  setOrDelete(data, "updated", card.updated);

  return data;
}

export function writeCard(card: Card): void {
  writeFileSync(card.file, stringifyMarkdown(cardData(card), card.body), "utf8");
}

export interface CardJson {
  id: string;
  title: string;
  kind: string;
  status: Column;
  milestone: number | null;
  priority: string | null;
  order: number | null;
  depends_on: string[];
  related: string[];
  blocked_reason: string | null;
  completed: string | null;
  resolution: string | null;
  created: string | null;
  updated: string | null;
  file: string;
}

export function cardJson(card: Card): CardJson {
  return {
    id: card.id,
    title: card.title,
    kind: card.kind,
    status: card.status,
    milestone: card.milestone,
    priority: card.priority,
    order: card.order,
    depends_on: card.dependsOn,
    related: card.related,
    blocked_reason: card.blockedReason,
    completed: card.completed,
    resolution: card.resolution,
    created: card.created,
    updated: card.updated,
    file: card.relFile,
  };
}
