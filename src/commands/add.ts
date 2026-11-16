import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cyan, dim, green } from "../ansi.js";
import { flag, list, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { nextOrder, scanBoard } from "../board.js";
import { cardJson, today, writeCard, type Card } from "../card.js";
import { DEFAULT_KIND, isKind, resolveColumn } from "../columns.js";
import { boardDir, relativeToRoot, resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";
import { parseMilestone, parseOrder, warn } from "../log.js";
import { slugify, uniqueId } from "../slug.js";
import { CARD_TEMPLATE } from "../templates.js";

const OPTIONS = {
  column: { type: "string" as const, short: "c" },
  kind: { type: "string" as const, short: "k" },
  milestone: { type: "string" as const, short: "m" },
  priority: { type: "string" as const, short: "p" },
  order: { type: "string" as const, short: "o" },
  "depends-on": { type: "string" as const, short: "d", multiple: true },
  related: { type: "string" as const, short: "r", multiple: true },
  body: { type: "string" as const, short: "b" },
  json: { type: "boolean" as const },
  root: ROOT_OPTION,
};

function bodyFrom(value: string | undefined): string {
  if (value === undefined) return CARD_TEMPLATE;
  if (value === "-") return readFileSync(0, "utf8");
  return readFileSync(path.resolve(value), "utf8");
}

export async function addCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const title = positionals.join(" ").trim();
  if (!title) {
    throw new UsageError("A card needs a title.", {
      hint: 'couch-potator add "Reduce cold start" -k feature -m 1',
    });
  }

  const column = resolveColumn(text(values, "column") ?? "todo");
  const rawKind = text(values, "kind");
  const kind = (rawKind ?? DEFAULT_KIND).trim().toLowerCase();
  if (rawKind && !isKind(kind)) {
    warn(`unknown kind "${kind}"; the viewer will draw it grey.`);
  }

  const milestone = parseMilestone(text(values, "milestone"), null);
  const priority = text(values, "priority")?.trim() || null;
  const id = uniqueId(slugify(title), new Set(board.byId.keys()));
  const file = path.join(boardDir(root, board.config), column, `${id}.md`);
  mkdirSync(path.dirname(file), { recursive: true });

  const inColumn = board.cards.filter((card) => card.status === column);
  const order = parseOrder(text(values, "order"), nextOrder(inColumn));

  const dependsOn = list(values, "depends-on");
  const related = list(values, "related");
  for (const dependency of dependsOn) {
    if (!board.byId.has(dependency)) warn(`depends_on "${dependency}" does not exist yet.`);
  }
  for (const sibling of related) {
    if (!board.byId.has(sibling)) warn(`related "${sibling}" does not exist yet.`);
  }
  if (dependsOn.includes(id)) {
    throw new UsageError("A card cannot depend on itself.");
  }

  const card: Card = {
    id,
    declaredId: id,
    title,
    kind,
    kindKnown: isKind(kind),
    status: column,
    milestone,
    priority,
    order,
    dependsOn,
    related,
    blockedReason: null,
    completed: null,
    resolution: null,
    created: today(),
    updated: today(),
    body: bodyFrom(text(values, "body")),
    file,
    relFile: relativeToRoot(root, file),
    data: {},
  };

  writeCard(card);

  if (flag(values, "json")) {
    console.log(JSON.stringify(cardJson(card), null, 2));
    return 0;
  }

  console.log(`${green("Added")} ${cyan(card.id)} to ${column} ${dim(card.relFile)}`);
  return 0;
}
