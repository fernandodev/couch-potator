import { yellow } from "./ansi.js";
import { UsageError } from "./errors.js";

export function warn(message: string): void {
  process.stderr.write(`${yellow("warning")} ${message}\n`);
}

export function plural(count: number, word: string, pluralWord?: string): string {
  return `${count} ${count === 1 ? word : (pluralWord ?? `${word}s`)}`;
}

export function parseMilestone(raw: string | undefined, fallback: number | null = null): number | null {
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "all" || value === "none" || value === "any") return null;
  if (!/^\d+$/.test(value)) {
    throw new UsageError(`Milestone must be a whole number, got "${raw}".`);
  }
  return Number(value);
}

export function parseOrder(raw: string | undefined, fallback: number | null = null): number | null {
  if (raw === undefined) return fallback;
  const value = raw.trim();
  if (value === "" || value === "-") return null;
  if (!/^-?\d+$/.test(value)) {
    throw new UsageError(`Order must be a whole number, got "${raw}".`);
  }
  return Number(value);
}
