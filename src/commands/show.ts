import { readFileSync } from "node:fs";
import { bold, cyan, dim } from "../ansi.js";
import { UsageError } from "../errors.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveCard, scanBoard } from "../board.js";
import { cardJson } from "../card.js";
import { COLUMN_LABEL } from "../columns.js";
import { resolveRoot } from "../config.js";

const OPTIONS = {
  json: { type: "boolean" as const },
  raw: { type: "boolean" as const },
  path: { type: "boolean" as const },
  root: ROOT_OPTION,
};

export async function showCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const reference = positionals[0];
  if (!reference) {
    throw new UsageError("show needs a card.");
  }
  const card = resolveCard(board, reference);

  if (flag(values, "path")) {
    console.log(card.file);
    return 0;
  }
  if (flag(values, "raw")) {
    process.stdout.write(readFileSync(card.file, "utf8"));
    return 0;
  }
  if (flag(values, "json")) {
    console.log(JSON.stringify({ ...cardJson(card), body: card.body }, null, 2));
    return 0;
  }

  const meta = [
    card.id,
    COLUMN_LABEL[card.status],
    card.kind,
    card.milestone == null ? null : `milestone ${card.milestone}`,
    card.priority ? `priority ${card.priority}` : null,
  ]
    .filter((value): value is string => value != null)
    .join(" · ");

  console.log(bold(card.title));
  console.log(dim(meta));
  console.log(dim(card.relFile));
  console.log("");
  console.log(card.body.trimEnd());
  if (card.dependsOn.length) {
    console.log("");
    console.log(`${dim("depends on")} ${card.dependsOn.map((id) => cyan(id)).join(" ")}`);
  }
  if (card.related.length) {
    console.log(`${dim("related")}    ${card.related.map((id) => cyan(id)).join(" ")}`);
  }
  if (card.surfaces.length) {
    console.log(`${dim("surfaces")}   ${card.surfaces.join(", ")}`);
  }
  if (card.environments.length) {
    console.log(`${dim("environments")} ${card.environments.join(", ")}`);
  }
  return 0;
}
