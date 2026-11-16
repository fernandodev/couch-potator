import { blue, bold, dim, green, red, table } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { milestonesOf, scanBoard } from "../board.js";
import { cardJson } from "../card.js";
import { COLUMN_LABEL, resolveColumn, type Column } from "../columns.js";
import { resolveRoot } from "../config.js";
import { parseMilestone } from "../log.js";

const OPTIONS = {
  column: { type: "string" as const, short: "c" },
  milestone: { type: "string" as const, short: "m" },
  kind: { type: "string" as const, short: "k" },
  all: { type: "boolean" as const },
  json: { type: "boolean" as const },
  ids: { type: "boolean" as const },
  root: ROOT_OPTION,
};

const statusTag = (column: Column): string => {
  const label = COLUMN_LABEL[column];
  if (column === "done") return green(label);
  if (column === "blocked") return red(label);
  if (column === "in-progress") return blue(label);
  return dim(label);
};

export async function listCommand(argv: string[]): Promise<number> {
  const { values } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const rawColumn = text(values, "column");
  const column = rawColumn ? resolveColumn(rawColumn) : null;
  const rawMilestone = text(values, "milestone");
  const milestone =
    flag(values, "all") || rawMilestone === undefined ? null : parseMilestone(rawMilestone, null);
  const kind = text(values, "kind")?.trim().toLowerCase();

  const cards = board.cards.filter((card) => {
    if (column && card.status !== column) return false;
    if (milestone !== null && card.milestone !== milestone) return false;
    if (kind && card.kind !== kind) return false;
    return true;
  });

  if (flag(values, "json")) {
    console.log(JSON.stringify(cards.map(cardJson), null, 2));
    return 0;
  }

  if (flag(values, "ids")) {
    for (const card of cards) console.log(card.id);
    return 0;
  }

  if (!cards.length) {
    console.log(dim("No cards."));
    return 0;
  }

  const rows = cards.map((card) => [
    statusTag(card.status),
    bold(card.id),
    card.kind,
    card.milestone == null ? dim("-") : String(card.milestone),
    card.title,
  ]);

  console.log(
    table(rows, {
      head: ["COLUMN", "ID", "KIND", "M", "TITLE"].map((heading) => dim(heading)),
    }),
  );

  const milestones = milestonesOf(board);
  const filters = [
    column ? `column=${column}` : null,
    milestone !== null ? `milestone=${milestone}` : null,
    kind ? `kind=${kind}` : null,
  ].filter((value): value is string => value != null);

  console.log("");
  console.log(
    dim(
      `${cards.length} of ${board.cards.length} cards · ${milestones.length} milestone${
        milestones.length === 1 ? "" : "s"
      }${filters.length ? ` · ${filters.join(" ")}` : ""}`,
    ),
  );
  return 0;
}
