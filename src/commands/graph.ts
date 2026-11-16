import { bold, dim } from "../ansi.js";
import { parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { scanBoard } from "../board.js";
import type { Card } from "../card.js";
import { resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";
import { parseMilestone, plural } from "../log.js";

const OPTIONS = {
  format: { type: "string" as const, short: "f" },
  milestone: { type: "string" as const, short: "m" },
  root: ROOT_OPTION,
};

const MAX_DEPTH = 9;

function layersOf(cards: Card[]): Card[][] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    const cached = depth.get(id);
    if (cached != null) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let value = 0;
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(dependency)) value = Math.max(value, walk(dependency) + 1);
    }
    visiting.delete(id);
    value = Math.min(value, MAX_DEPTH);
    depth.set(id, value);
    return value;
  };

  for (const card of cards) walk(card.id);

  const max = Math.max(0, ...cards.map((card) => depth.get(card.id) ?? 0));
  const layers = Array.from({ length: max + 1 }, () => [] as Card[]);
  for (const card of cards) {
    const index = depth.get(card.id) ?? 0;
    layers[index]?.push(card);
  }
  for (const layer of layers) layer.sort((a, b) => a.id.localeCompare(b.id));
  return layers;
}

function edgesOf(cards: Card[]): Array<[Card, Card]> {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const edges: Array<[Card, Card]> = [];
  for (const card of cards) {
    for (const dependency of card.dependsOn) {
      const from = byId.get(dependency);
      if (from) edges.push([from, card]);
    }
  }
  return edges;
}

const dotEscape = (value: string): string => value.replace(/"/g, '\\"');
const mermaidEscape = (value: string): string => value.replace(/"/g, "'");

export async function graphCommand(argv: string[]): Promise<number> {
  const { values } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);

  const format = (text(values, "format") ?? "text").trim().toLowerCase();
  if (!["text", "mermaid", "dot"].includes(format)) {
    throw new UsageError(`Unknown format "${format}".`, {
      details: ["Formats: text, mermaid, dot"],
    });
  }

  const rawMilestone = text(values, "milestone");
  const milestone = rawMilestone === undefined ? null : parseMilestone(rawMilestone, null);
  const cards =
    milestone === null
      ? board.cards
      : board.cards.filter((card) => card.milestone === milestone);

  if (!cards.length) {
    console.log(dim("No cards."));
    return 0;
  }

  const edges = edgesOf(cards);

  if (format === "mermaid") {
    const ids = new Map(cards.map((card, index) => [card.id, `n${index}`]));
    const lines = ["graph LR"];
    for (const card of cards) {
      lines.push(`  ${ids.get(card.id)}["${mermaidEscape(card.title)}"]`);
    }
    for (const [from, to] of edges) {
      lines.push(`  ${ids.get(from.id)} --> ${ids.get(to.id)}`);
    }
    console.log(lines.join("\n"));
    return 0;
  }

  if (format === "dot") {
    const lines = ["digraph board {", "  rankdir=LR;"];
    for (const card of cards) {
      lines.push(`  "${dotEscape(card.id)}" [label="${dotEscape(card.title)}"];`);
    }
    for (const [from, to] of edges) {
      lines.push(`  "${dotEscape(from.id)}" -> "${dotEscape(to.id)}";`);
    }
    lines.push("}");
    console.log(lines.join("\n"));
    return 0;
  }

  const layers = layersOf(cards);
  layers.forEach((layer, index) => {
    if (!layer.length) return;
    console.log(bold(`Layer ${index}`));
    for (const card of layer) {
      console.log(`  ${card.id}  ${dim(card.title)}`);
    }
    if (index < layers.length - 1) console.log("");
  });

  if (edges.length) {
    console.log("");
    console.log(bold("Edges"));
    for (const [from, to] of edges) {
      console.log(`  ${from.id} ${dim("->")} ${to.id}`);
    }
  }

  console.log("");
  console.log(
    dim(
      `${plural(cards.length, "node")} · ${plural(edges.length, "edge")}${
        milestone === null ? "" : ` · milestone ${milestone}`
      }`,
    ),
  );
  return 0;
}
