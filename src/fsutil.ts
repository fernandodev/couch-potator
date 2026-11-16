import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

export function writeIfMissing(file: string, content: string): boolean {
  if (existsSync(file)) return false;
  writeFileSync(file, content, "utf8");
  return true;
}

export function ensureLine(file: string, line: string): boolean {
  const existing = readIfExists(file);
  if (existing == null) {
    writeFileSync(file, `${line}\n`, "utf8");
    return true;
  }
  const lines = existing.split(/\r?\n/).map((entry) => entry.trim());
  if (lines.includes(line)) return false;
  const next = existing === "" || existing.endsWith("\n") ? existing : `${existing}\n`;
  writeFileSync(file, `${next}${line}\n`, "utf8");
  return true;
}
