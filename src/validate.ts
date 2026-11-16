import { COLUMNS } from "./columns.js";
import type { Board } from "./board.js";
import type { Card } from "./card.js";
import { relativeToRoot } from "./config.js";
import type { Issue } from "./types.js";

function canonicalCycle(cycle: string[]): string[] {
  const nodes = cycle.slice(0, -1);
  if (!nodes.length) return cycle;
  let best = 0;
  for (let index = 1; index < nodes.length; index += 1) {
    const candidate = nodes[index];
    const current = nodes[best];
    if (candidate !== undefined && current !== undefined && candidate < current) best = index;
  }
  return [...nodes.slice(best), ...nodes.slice(0, best), nodes[best] ?? ""];
}

export function findCycles(cards: Card[]): string[][] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    const current = state.get(id) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(id);
      if (start === -1) return;
      const cycle = [...stack.slice(start), id];
      const canonical = canonicalCycle(cycle);
      const key = canonical.join("->");
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push(cycle);
      }
      return;
    }

    state.set(id, 1);
    stack.push(id);
    const card = byId.get(id);
    for (const dependency of card?.dependsOn ?? []) {
      if (byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(id, 2);
  };

  for (const card of cards) visit(card.id);
  return cycles;
}

export function validateBoard(board: Board): Issue[] {
  const issues: Issue[] = [...board.issues];
  const root = board.root;

  const grouped = new Map<string, Card[]>();
  for (const card of board.cards) {
    const list = grouped.get(card.id) ?? [];
    list.push(card);
    grouped.set(card.id, list);
  }
  for (const [id, cards] of grouped) {
    if (cards.length > 1) {
      issues.push({
        level: "error",
        message: `Duplicate card id "${id}" in ${cards
          .map((card) => card.relFile)
          .join(" and ")}.`,
        file: cards[0]?.relFile,
      });
    }
  }

  for (const card of board.cards) {
    const file = relativeToRoot(root, card.file);

    if (card.declaredId != null && card.declaredId !== card.id) {
      issues.push({
        level: "error",
        message: `Frontmatter id "${card.declaredId}" does not match the file name "${card.id}".`,
        file,
      });
    }
    if (card.data.id == null) {
      issues.push({
        level: "warning",
        message: "No id in frontmatter; the file name is being used.",
        file,
      });
    }
    if (card.data.title == null || String(card.data.title).trim() === "") {
      issues.push({ level: "warning", message: "No title in frontmatter; showing the file name.", file });
    }
    if (!card.kindKnown) {
      issues.push({
        level: "warning",
        message: `Unknown kind "${card.kind}"; known kinds are foundation, design, feature, quality, release, fix.`,
        file,
      });
    }
    if (card.data.milestone != null && card.milestone == null) {
      issues.push({
        level: "warning",
        message: `Milestone "${String(card.data.milestone)}" is not a whole number and is ignored by the filter.`,
        file,
      });
    }
    if (card.data.status != null) {
      issues.push({
        level: "warning",
        message: "frontmatter has a `status` key; the column folder is the status and the key is ignored.",
        file,
      });
    }
    if (!card.body.trim()) {
      issues.push({ level: "warning", message: "Spec body is empty.", file });
    }

    for (const dependency of card.dependsOn) {
      if (dependency === card.id) {
        issues.push({ level: "error", message: "A card cannot depend on itself.", file });
      } else if (!board.byId.has(dependency)) {
        issues.push({
          level: "error",
          message: `depends_on "${dependency}" does not match any card.`,
          file,
        });
      }
    }
    for (const related of card.related) {
      if (related === card.id) {
        issues.push({ level: "error", message: "A card cannot be related to itself.", file });
      } else if (!board.byId.has(related)) {
        issues.push({
          level: "error",
          message: `related "${related}" does not match any card.`,
          file,
        });
      }
    }

    if (card.status === "blocked" && !card.blockedReason) {
      issues.push({
        level: "warning",
        message: "Card is blocked but has no blocked_reason.",
        file,
      });
    }
  }

  for (const column of COLUMNS) {
    const inColumn = board.cards.filter((card) => card.status === column && card.order != null);
    const seen = new Map<number, Card>();
    for (const card of inColumn) {
      const order = card.order as number;
      const other = seen.get(order);
      if (other) {
        issues.push({
          level: "warning",
          message: `order ${order} is also used by "${other.id}" in ${column}.`,
          file: relativeToRoot(root, card.file),
        });
      } else {
        seen.set(order, card);
      }
    }
  }

  for (const cycle of findCycles(board.cards)) {
    issues.push({
      level: "error",
      message: `Dependency cycle: ${cycle.join(" \u2192 ")}`,
      file: board.byId.get(cycle[0] ?? "")?.relFile,
    });
  }

  const milestones = new Set<number>(board.brief.milestones);
  for (const card of board.cards) if (card.milestone != null) milestones.add(card.milestone);
  if (board.brief.exists && board.brief.currentMilestone != null && !milestones.has(board.brief.currentMilestone)) {
    issues.push({
      level: "warning",
      message: `current_milestone ${board.brief.currentMilestone} has no cards and is not declared under milestones.`,
    });
  }
  if (!board.brief.exists) {
    issues.push({
      level: "warning",
      message: `No ${board.config.brief}; the board has no name, brief or current milestone.`,
    });
  }

  return issues;
}
