export interface TemplateContext {
  command: string;
  boardPath: string;
  briefPath: string;
  projectName: string;
}

export const CARD_TEMPLATE = `## Why

_What problem does this solve, and who feels it?_

## What

_What changes, in enough detail to build it without guessing._

## Done when

- [ ] _the observable outcome that means this is finished_
`;

export function projectTemplate(projectName: string, milestone = 1): string {
  return `---
name: ${projectName}
current_milestone: ${milestone}
milestones: [${milestone}]
---

# ${projectName}

_One paragraph on what this project is and who it is for._

## Milestones

- **${milestone}** — first milestone, in progress.
`;
}

export const AGENTS_START = "<!-- couch-potator:start -->";
export const AGENTS_END = "<!-- couch-potator:end -->";

export function agentsBlock(context: TemplateContext): string {
  const { command, boardPath } = context;
  return `${AGENTS_START}
## Board

This project keeps its work on a folder-backed board at \`${boardPath}/\`:

\`\`\`text
${boardPath}/todo/*.md
${boardPath}/in-progress/*.md
${boardPath}/blocked/*.md
${boardPath}/done/*.md
\`\`\`

Every card is a markdown spec. Its folder is its status, its file name is its id,
and its frontmatter holds \`title\`, \`kind\`, \`milestone\`, \`depends_on\` and
\`related\`. There are exactly four columns; never create a fifth folder.

Prefer the CLI over hand-editing frontmatter:

| Task | Command |
| --- | --- |
| Read the board | \`${command} list --json\` |
| Read one spec | \`${command} show <card>\` |
| Create a card | \`${command} add "Title" -k feature -m 1\` |
| Change status | \`${command} move <card> done\` |
| Record a dependency | \`${command} dep add <card> <card>\` |
| Set a field | \`${command} set <card> milestone 2\` |
| Validate | \`${command} check\` |
| Read-only browser view | \`${command} view --no-open\` |

Run \`${command} check\` before claiming work is done. The markdown files are the
source of truth; the browser viewer is read-only and never writes.
${AGENTS_END}`;
}

export function skillTemplate(context: TemplateContext): string {
  const { command, boardPath, briefPath } = context;
  return `---
name: Board Viewer
description: Read or update this project's spec board (${boardPath}/todo, in-progress, blocked, done) and open a read-only browser view with cards, rendered specs, milestones and a dependency graph. Use when the owner wants to see, add, move, or read a card or spec.
---

# Board

The board is a plain folder tree at \`${boardPath}/\`:

\`\`\`text
${boardPath}/
├── todo/*.md
├── in-progress/*.md
├── blocked/*.md
└── done/*.md
\`\`\`

Each card is a markdown spec. The folder is the status; the file name is the id;
the frontmatter holds the metadata:

\`\`\`yaml
---
id: add-oauth-login
title: Add OAuth login
kind: feature          # foundation | design | feature | quality | release | fix
milestone: 2
priority: high
order: 10
depends_on: [github-oauth-app]
related: [session-store]
blocked_reason:
completed:
resolution:
created: 2026-11-16
updated: 2026-11-16
---
\`\`\`

${briefPath} holds the project name, the current milestone and the brief.

## Commands

| Command | Effect |
| --- | --- |
| \`${command} list [--json]\` | List cards, grouped by column. \`--json\` is the agent-facing form. |
| \`${command} list -c todo -m 2\` | Filter by column and milestone. |
| \`${command} show <card>\` | Print a spec. \`--raw\` includes frontmatter, \`--path\` prints its file. |
| \`${command} add "Title" [-c todo] [-k kind] [-m 2] [-d dep]...\` | Create a card. |
| \`${command} move <card> <column> [--top|--bottom|--before <card>|--after <card>]\` | Change status and order. |
| \`${command} set <card> <field> <value>\` | Set \`kind\`, \`milestone\`, \`priority\`, \`order\`, \`blocked_reason\`, \`resolution\`, \`completed\` or \`title\`. |
| \`${command} dep add|rm <card> <card>\` | Edit \`depends_on\`. Cycles are rejected. |
| \`${command} rel add|rm <card> <card>\` | Edit \`related\`. |
| \`${command} check\` | Validate ids, links, cycles, columns and warnings. Exits 1 on errors. |
| \`${command} graph --format text|mermaid|dot\` | Print the dependency graph without a browser. |
| \`${command} view\` | Regenerate and open the read-only viewer. |
| \`${command} edit <card>\` | Open the spec in \`$EDITOR\`. |
| \`${command} rm <card> --force\` | Delete a card. |

\`<card>\` accepts a full id or a unique prefix.

## The viewer

\`${command} view\` writes a single self-contained HTML file to
\`.couch-potator/viewer/board.html\` and opens it. There is no server, no port and
no background process. The page is read-only: cards open a rendered spec modal,
the milestone dropdown filters cards and graph together, and the Graph tab draws
a left-to-right dependency graph with pan, zoom and hover highlighting.

Run it in the foreground; it exits immediately after writing the file.

\`${command} view --watch\` keeps running and rebuilds the file when anything under
\`${boardPath}/\` or \`${briefPath}\` changes. The browser does not reload itself —
press the page's \`Reload\` button or refresh the tab.

\`\`\`text
Board viewer: /path/to/project/.couch-potator/viewer/board.html
VIEWER_FILE=/path/to/project/.couch-potator/viewer/board.html
12 cards across 1 project (2 milestones)
Read-only. Regenerate with \`${command} view\`.
\`\`\`

Take the path from the \`VIEWER_FILE=\` line and tell the owner that line plus
"the board is read-only". Do not summarise the board unless they ask.

## Rules

- Never write to the board through the viewer. It has no write path; do not add one.
- Change cards with the CLI or by editing the markdown file, never by moving
  files between ad-hoc folders.
- Keep the four column folders exactly as they are: \`todo\`, \`in-progress\`,
  \`blocked\`, \`done\`.
- Run \`${command} check\` after changing dependencies; a cycle or a missing id
  makes the graph lie.
- The files are the source of truth. The viewer is a reading aid.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| \`No couch-potator board found here\` | Run from inside the project, or pass \`--root <path>\`. |
| \`No card called "..."\` | The id or prefix matched nothing. Run \`${command} list --ids\`. |
| \`"..." is ambiguous\` | The prefix matches several cards. Use a longer prefix. |
| A card is missing from the board | It must live in one of the four column folders with a \`.md\` extension. |
| \`check\` reports a cycle | Remove one \`depends_on\`; the message prints the cycle path. |
| A card shows its file name as the title | No usable \`title\` in frontmatter. |
| The board looks empty | A milestone is selected. Choose \`All milestones\` in the header. |
| No milestone dropdown | No card declares a \`milestone\` and ${briefPath} declares none. |
`;
}
