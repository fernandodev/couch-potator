const enabled =
  process.env.NO_COLOR == null &&
  process.env.TERM !== "dumb" &&
  (process.stdout.isTTY === true || process.env.FORCE_COLOR != null);

const wrap =
  (open: string, close: string) =>
  (value: string): string =>
    enabled ? `\u001b[${open}m${value}\u001b[${close}m` : value;

export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const red = wrap("31", "39");
export const green = wrap("32", "39");
export const yellow = wrap("33", "39");
export const blue = wrap("34", "39");
export const magenta = wrap("35", "39");
export const cyan = wrap("36", "39");

const ANSI = /\u001b\[[0-9;]*m/g;

export const visibleLength = (value: string): number => value.replace(ANSI, "").length;

export function padEnd(value: string, width: number): string {
  const missing = width - visibleLength(value);
  return missing > 0 ? value + " ".repeat(missing) : value;
}

export interface TableOptions {
  head?: string[];
  gap?: number;
}

export function table(rows: string[][], options: TableOptions = {}): string {
  const gap = options.gap ?? 2;
  const all = options.head ? [options.head, ...rows] : rows;
  if (!all.length) return "";

  const width = Math.max(...all.map((row) => row.length));
  const sizes = Array.from({ length: width }, (_, index) =>
    Math.max(...all.map((row) => visibleLength(row[index] ?? ""))),
  );

  const format = (row: string[]): string =>
    row
      .map((cell, index) => (index === row.length - 1 ? cell : padEnd(cell ?? "", sizes[index] ?? 0)))
      .join(" ".repeat(gap))
      .trimEnd();

  if (!options.head) return all.map(format).join("\n");
  return [format(options.head), ...rows.map(format)].join("\n");
}
