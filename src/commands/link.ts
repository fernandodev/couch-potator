import { cyan, dim, green, red } from "../ansi.js";
import { parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveCard, scanBoard } from "../board.js";
import { today, writeCard } from "../card.js";
import { resolveRoot } from "../config.js";
import { CliError, UsageError } from "../errors.js";
import { warn } from "../log.js";
import { findCycles } from "../validate.js";
import { refreshViewer } from "../viewer/refresh.js";

const OPTIONS = {
  root: ROOT_OPTION,
};

export type LinkField = "dep" | "rel";

export async function linkCommand(argv: string[], field: LinkField): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const [sub, ...rest] = positionals;
  if (!sub) {
    throw new UsageError(`Usage: couch-potator ${field} <add|rm> <card> <card>`, {
      hint: `Or \`couch-potator ${field} <card>\` to list them.`,
    });
  }

  const property = field === "dep" ? "dependsOn" : "related";

  if (sub === "add" || sub === "rm") {
    const [first, second] = rest;
    if (!first || !second) {
      throw new UsageError(`${field} ${sub} needs two cards.`);
    }

    const card = resolveCard(board, first);
    const other = resolveCard(board, second);
    if (card.id === other.id) {
      throw new UsageError("A card cannot link to itself.");
    }

    const links = card[property];
    if (sub === "add") {
      if (links.includes(other.id)) {
        console.log(dim(`${card.id} already links to ${other.id}.`));
        return 0;
      }
      links.push(other.id);

      if (field === "dep") {
        const cycle = findCycles(board.cards).find((path) => path.includes(card.id));
        if (cycle) {
          links.pop();
          throw new CliError(`That dependency would create a cycle: ${cycle.join(" \u2192 ")}`);
        }
      }

      card.updated = today();
      writeCard(card);
      refreshViewer(root);
      console.log(`${green("Linked")} ${cyan(card.id)} ${dim("\u2192")} ${other.id}`);
      return 0;
    }

    const at = links.indexOf(other.id);
    if (at === -1) {
      warn(`${card.id} does not link to ${other.id}.`);
      return 0;
    }
    links.splice(at, 1);
    card.updated = today();
    writeCard(card);
    refreshViewer(root);
    console.log(`${green("Unlinked")} ${cyan(card.id)} ${dim("\u2192")} ${other.id}`);
    return 0;
  }

  const card = resolveCard(board, sub);
  const links = card[property];
  if (!links.length) {
    console.log(dim("none"));
    return 0;
  }
  for (const id of links) {
    const target = board.byId.get(id);
    console.log(`${cyan(id)}  ${target ? target.title : red("missing")}`);
  }
  return 0;
}
