import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

export function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

export function writeIfMissing(file: string, content: string): boolean {
  if (existsSync(file)) return false;
  writeFileSync(file, content, "utf8");
  return true;
}

/**
 * Replaces a file in one step, so a reader never sees a truncated version.
 * Watch mode and the viewer's Reload button can otherwise race a large write.
 */
export function writeFileAtomic(file: string, content: string): void {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, content, "utf8");
  try {
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
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
