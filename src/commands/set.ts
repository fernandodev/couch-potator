import { cyan, dim, green } from "../ansi.js";
import { parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveCard, scanBoard } from "../board.js";
import { today, writeCard } from "../card.js";
import { isKind, KINDS } from "../columns.js";
import { resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";
import { parseMilestone, parseOrder } from "../log.js";

const OPTIONS = {
  root: ROOT_OPTION,
};

const FIELD_ALIASES: Record<string, string> = {
  kind: "kind",
  milestone: "milestone",
  priority: "priority",
  order: "order",
  title: "title",
  blocked_reason: "blocked_reason",
  blocked: "blocked_reason",
  reason: "blocked_reason",
  resolution: "resolution",
  completed: "completed",
};

export async function setCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const [reference, rawField, ...rest] = positionals;
  if (!reference || !rawField) {
    throw new UsageError("set needs a card, a field and a value.", {
      hint: "couch-potator set <card> milestone 2",
    });
  }

  const field = FIELD_ALIASES[rawField.trim().toLowerCase()];
  if (!field) {
    throw new UsageError(`Unknown field "${rawField}".`, {
      details: ["kind, milestone, priority, order, title, blocked_reason, resolution, completed"],
    });
  }

  const card = resolveCard(board, reference);
  const raw = rest.join(" ");
  const clear = raw === "" || raw === "-";

  let shown: string | number | null;

  switch (field) {
    case "kind": {
      const kind = raw.trim().toLowerCase();
      if (!isKind(kind)) {
        throw new UsageError(`Unknown kind "${raw}".`, {
          details: [`Known kinds: ${KINDS.join(", ")}`],
        });
      }
      card.kind = kind;
      card.kindKnown = true;
      shown = kind;
      break;
    }
    case "milestone":
      card.milestone = clear ? null : parseMilestone(raw, null);
      shown = card.milestone;
      break;
    case "priority":
      card.priority = clear ? null : raw;
      shown = card.priority;
      break;
    case "order":
      card.order = clear ? null : parseOrder(raw, null);
      shown = card.order;
      break;
    case "title":
      if (clear) throw new UsageError("A card needs a title.");
      card.title = raw;
      shown = raw;
      break;
    case "blocked_reason":
      card.blockedReason = clear ? null : raw;
      shown = card.blockedReason;
      break;
    case "resolution":
      card.resolution = clear ? null : raw;
      shown = card.resolution;
      break;
    case "completed":
      card.completed = clear ? null : raw === "today" ? today() : raw;
      shown = card.completed;
      break;
    default:
      throw new UsageError(`Unsupported field "${field}".`);
  }

  card.updated = today();
  writeCard(card);

  console.log(
    `${green("Set")} ${cyan(card.id)} ${field} = ${shown == null ? dim("(none)") : String(shown)}`,
  );
  return 0;
}
