import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { cyan, dim, green } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { cardsInColumn, resolveCard, scanBoard } from "../board.js";
import { today, writeCard, type Card } from "../card.js";
import { resolveColumn } from "../columns.js";
import { boardDir, relativeToRoot, resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";
import { refreshViewer } from "../viewer/refresh.js";

const OPTIONS = {
  top: { type: "boolean" as const },
  bottom: { type: "boolean" as const },
  before: { type: "string" as const },
  after: { type: "string" as const },
  root: ROOT_OPTION,
};

function renumber(cards: Card[]): void {
  cards.forEach((card, index) => {
    card.order = (index + 1) * 10;
  });
}

export async function moveCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const [reference, rawColumn] = positionals;
  if (!reference || !rawColumn) {
    throw new UsageError("move needs a card and a column.", {
      hint: "couch-potator move <card> done [--top|--bottom|--before <card>|--after <card>]",
    });
  }
  if (flag(values, "top") && flag(values, "bottom")) {
    throw new UsageError("--top and --bottom are mutually exclusive.");
  }
  if (text(values, "before") && text(values, "after")) {
    throw new UsageError("--before and --after are mutually exclusive.");
  }

  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);
  const card = resolveCard(board, reference);
  const target = resolveColumn(rawColumn);
  const source = card.status;

  const siblings =
    target === source
      ? cardsInColumn(board, source).filter((item) => item.id !== card.id)
      : cardsInColumn(board, target);

  let index = siblings.length;
  if (flag(values, "top")) index = 0;
  if (flag(values, "bottom")) index = siblings.length;

  const before = text(values, "before");
  if (before) {
    const at = siblings.findIndex((item) => item.id === before);
    if (at === -1) throw new UsageError(`No card "${before}" in ${target}.`);
    index = at;
  }
  const after = text(values, "after");
  if (after) {
    const at = siblings.findIndex((item) => item.id === after);
    if (at === -1) throw new UsageError(`No card "${after}" in ${target}.`);
    index = at + 1;
  }

  const ordered = [...siblings.slice(0, index), card, ...siblings.slice(index)];
  renumber(ordered);

  const remaining = target === source ? [] : cardsInColumn(board, source).filter((item) => item.id !== card.id);
  renumber(remaining);

  const oldFile = card.file;
  const newFile = path.join(boardDir(root, board.config), target, path.basename(oldFile));

  card.status = target;
  card.updated = today();

  for (const other of ordered) {
    if (other.id !== card.id) writeCard(other);
  }
  for (const other of remaining) writeCard(other);

  card.file = newFile;
  card.relFile = relativeToRoot(root, newFile);
  mkdirSync(path.dirname(newFile), { recursive: true });
  writeCard(card);

  if (oldFile !== newFile && existsSync(oldFile)) unlinkSync(oldFile);

  refreshViewer(root);
  console.log(
    `${green("Moved")} ${cyan(card.id)} ${dim(`${source} \u2192`)} ${target} ${dim(card.relFile)}`,
  );
  return 0;
}
