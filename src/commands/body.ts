import { readFileSync } from "node:fs";
import path from "node:path";
import { cyan, dim, green } from "../ansi.js";
import { parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveCard, scanBoard } from "../board.js";
import { today, writeCard } from "../card.js";
import { resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";

const OPTIONS = {
  file: { type: "string" as const, short: "f" },
  root: ROOT_OPTION,
};

export async function bodyCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const reference = positionals[0];
  const source = text(values, "file");
  if (!reference || !source) {
    throw new UsageError("body needs a card and a file.", {
      hint: "couch-potator body <card> --file <path|->",
    });
  }

  const card = resolveCard(board, reference);
  card.body = source === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(source), "utf8");
  card.updated = today();
  writeCard(card);

  console.log(`${green("Updated body")} ${cyan(card.id)} ${dim(card.relFile)}`);
  return 0;
}
