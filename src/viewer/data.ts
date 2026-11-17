import type { Board } from "../board.js";
import { milestonesOf, projectSlug } from "../board.js";
import type { Card } from "../card.js";
import { briefPath, relativeToRoot } from "../config.js";

export interface ViewerSpec {
  id: string;
  title: string;
  kind: string;
  status: string;
  file: string;
  milestone: number | null;
  priority: string | null;
  blocked_reason: string | null;
  completed: string | null;
  resolution: string | null;
  depends_on: string[];
  related: string[];
  surfaces: string[];
  body: string;
}

export interface ViewerProject {
  slug: string;
  name: string;
  current_milestone: number | null;
  milestones: number[];
  brief: string;
  brief_file: string;
  specs: ViewerSpec[];
}

export interface ViewerPayload {
  workspace: string;
  generated: string;
  projects: ViewerProject[];
}

export interface PayloadOptions {
  /** Overrides the milestone the page opens on. `null` means All milestones. */
  milestone?: number | null;
}

function specOf(card: Card): ViewerSpec {
  return {
    id: card.id,
    title: card.title,
    kind: card.kind,
    status: card.status,
    file: card.relFile,
    milestone: card.milestone,
    priority: card.priority,
    blocked_reason: card.blockedReason,
    completed: card.completed,
    resolution: card.resolution,
    depends_on: card.dependsOn,
    related: card.related,
    surfaces: card.surfaces,
    body: card.body,
  };
}

export function buildPayload(
  root: string,
  board: Board,
  options: PayloadOptions = {},
): ViewerPayload {
  const milestones = milestonesOf(board);
  const fallback = milestones.length ? (milestones[milestones.length - 1] ?? null) : null;
  const current =
    options.milestone !== undefined
      ? options.milestone
      : (board.brief.currentMilestone ?? fallback);

  return {
    workspace: root,
    generated: new Date().toISOString(),
    projects: [
      {
        slug: projectSlug(root),
        name: board.brief.name,
        current_milestone: current,
        milestones,
        brief: board.brief.body,
        brief_file: relativeToRoot(root, briefPath(root, board.config)),
        specs: board.cards.map(specOf),
      },
    ],
  };
}
