import { unlinkSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { cyan, green } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveCard, scanBoard } from "../board.js";
import { resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";
import { refreshViewer } from "../viewer/refresh.js";

const OPTIONS = {
  force: { type: "boolean" as const, short: "f" },
  yes: { type: "boolean" as const, short: "y" },
  root: ROOT_OPTION,
};

export async function rmCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);
  const reference = positionals[0];
  if (!reference) throw new UsageError("rm needs a card.");

  const card = resolveCard(board, reference);

  if (!flag(values, "force") && !flag(values, "yes")) {
    if (!process.stdin.isTTY) {
      throw new UsageError(`Refusing to delete ${card.id} without confirmation.`, {
        hint: "Pass --force to delete it non-interactively.",
      });
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Delete ${card.id} "${card.title}"? [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Cancelled.");
      return 0;
    }
  }

  unlinkSync(card.file);
  refreshViewer(root);
  console.log(`${green("Deleted")} ${cyan(card.id)} ${card.relFile}`);
  return 0;
}
