import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { CliError } from "./errors.js";

export type Frontmatter = Record<string, unknown>;

export interface ParsedMarkdown {
  data: Frontmatter;
  body: string;
  hasFrontmatter: boolean;
}

const CANONICAL_KEYS = [
  "id",
  "title",
  "kind",
  "milestone",
  "priority",
  "order",
  "depends_on",
  "related",
  "surfaces",
  "blocked_reason",
  "completed",
  "resolution",
  "created",
  "updated",
];

export function parseMarkdown(raw: string): ParsedMarkdown {
  const text = raw.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  if ((lines[0] ?? "").trim() !== "---") {
    return { data: {}, body: text.replace(/^\n+/, ""), hasFrontmatter: false };
  }

  let end = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (line === "---" || line === "...") {
      end = index;
      break;
    }
  }

  if (end === -1) {
    return { data: {}, body: text.replace(/^\n+/, ""), hasFrontmatter: false };
  }

  let data: unknown;
  try {
    data = parseYaml(lines.slice(1, end).join("\n"));
  } catch (error) {
    throw new CliError(`Invalid frontmatter: ${(error as Error).message}`);
  }

  if (data == null) data = {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new CliError("Invalid frontmatter: expected a mapping of keys to values.");
  }

  return {
    data: data as Frontmatter,
    body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""),
    hasFrontmatter: true,
  };
}

export function orderFrontmatter(data: Frontmatter): Frontmatter {
  const ordered: Frontmatter = {};
  for (const key of CANONICAL_KEYS) {
    if (data[key] !== undefined) ordered[key] = data[key];
  }
  for (const [key, value] of Object.entries(data)) {
    if (!(key in ordered) && value !== undefined) ordered[key] = value;
  }
  return ordered;
}

export function stringifyMarkdown(data: Frontmatter, body: string): string {
  const ordered = orderFrontmatter(data);
  const yaml = stringifyYaml(ordered, { lineWidth: 0 }).trimEnd();
  const trimmed = body.replace(/^\n+/, "").replace(/\s+$/, "");
  return `---\n${yaml}\n---\n\n${trimmed}\n`;
}
