export interface TemplateContext {
  command: string;
  boardPath: string;
  briefPath: string;
  projectName: string;
}

export const CARD_TEMPLATE = `## Summary

_One or two sentences describing the outcome._

## Why

_What problem this solves, and who feels it._

## User story

As a _[person]_, I want _[outcome]_ so that _[reason]_.

_A short narrative: where they start, what they do, and what they see._

## What

_Observable behaviour, in plain language. No implementation._

## Acceptance criteria

- [ ] _A person can..._

## Out of scope

- _What this card does not cover._

## Dependencies

- _Card ids this waits for, if any._

## Decisions

- _YYYY-MM-DD — what the owner chose and why._
`;

export function projectTemplate(projectName: string, milestone = 1): string {
  return `---
name: ${projectName}
current_milestone: ${milestone}
milestones: [${milestone}]
status: active
---

# ${projectName}

_One paragraph on what this project is, who it is for, and why it matters._

## Vision

_What the product is, in the owner's words._

## Audience

_Who uses it, and what they need._

## Core journeys

- _The shortest end-to-end path through the product._

## Non-goals

- _What this version will not do._

## Constraints

- _Devices, budget, timeline, privacy, hosting, offline._

## Stack decisions

| Area | Decision | Why | Date |
| --- | --- | --- | --- |
| | | | |

## Design direction

_References, anti-references, tone, brand._

## Glossary

- **_Word_** — _what it means in this product._

## Milestones

- **${milestone}** — _the smallest version that is genuinely useful._

## Decision log

- _YYYY-MM-DD — decision and reason._

## Open project questions

- _None yet._

## Working state

Discovery has not started. Next: ask the first discovery batch.

## Ideas / later

- _Features and ideas that are not in the current milestone._
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
and its frontmatter holds \`title\`, \`kind\`, \`milestone\`, \`depends_on\`,
\`related\`, \`surfaces\`, \`blocked_reason\` and \`resolution\`. There are exactly
four columns; never create a fifth folder.

For product planning, use the \`couch-potator-planner\` skill. To re-discuss a
blocked card, run \`/unblock\`; the \`couch-potator-unblock\` skill explains the
block, records the owner's answers and moves ready cards back to \`todo\`. This
block is about board mechanics.

Prefer the CLI over hand-editing frontmatter:

| Task | Command |
| --- | --- |
| Read the board | \`${command} list --json\` |
| Read one spec | \`${command} show <card>\` |
| Create a card | \`${command} add "Title" -k feature -m 1 -s board-screen\` |
| Replace a spec body | \`${command} body <card> --file <path>\` |
| Change status | \`${command} move <card> done\` |
| Set a field | \`${command} set <card> surfaces "board-screen,card-panel"\` |
| Record a dependency | \`${command} dep add <card> <card>\` |
| Validate | \`${command} check\` |
| Read-only browser view | \`${command} view --no-open\` |

Run \`${command} check\` before claiming work is done. The markdown files are the
source of truth; the browser viewer is read-only and never writes.
${AGENTS_END}`;
}

export function skillTemplate(context: TemplateContext): string {
  const { command, boardPath, briefPath } = context;
  return `---
name: couch-potator-board
description: Read or update this project's couch-potator spec board (${boardPath}/todo, in-progress, blocked, done) and open a read-only browser view with cards, rendered specs, milestones and a dependency graph. Use when the owner wants to see, add, move, or read a card or spec.
---

# Couch Potator Board

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
priority: must         # must | should | could
order: 10
depends_on: [github-oauth-app]
related: [session-store]
surfaces: [sign-in]
blocked_reason:
completed:
resolution:
created: 2026-11-16
updated: 2026-11-16
---
\`\`\`

${briefPath} holds the project name, the current milestone and the brief.

For product planning, use the \`couch-potator-planner\` skill. This skill is the
mechanics reference: commands, the viewer and board rules.

To re-discuss a blocked card, use the \`couch-potator-unblock\` skill, or run
\`/unblock\`. It handles the owner discussion; this skill only covers mechanics.

## Commands

| Command | Effect |
| --- | --- |
| \`${command} list [--json]\` | List cards, grouped by column. \`--json\` is the agent-facing form. |
| \`${command} list -c todo -m 2\` | Filter by column and milestone. |
| \`${command} show <card>\` | Print a spec. \`--raw\` includes frontmatter, \`--path\` prints its file. |
| \`${command} add "Title" [-c todo] [-k kind] [-m 2] [-p must] [-s surface]... [-d dep]... [--body <file>]\` | Create a card. |
| \`${command} body <card> --file <path>\` | Replace a card body. Use \`-\` to read stdin. |
| \`${command} move <card> <column> [--top|--bottom|--before <card>|--after <card>]\` | Change status and order. |
| \`${command} set <card> <field> <value>\` | Set \`kind\`, \`milestone\`, \`priority\`, \`order\`, \`title\`, \`surfaces\`, \`blocked_reason\`, \`resolution\` or \`completed\`. |
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
- Run \`${command} check\` after changing dependencies or surfaces; a cycle or a
  missing id makes the graph lie, and two \`in-progress\` cards that share a surface
  collide.
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

export function plannerSkillTemplate(context: TemplateContext): string {
  const { command, boardPath, briefPath } = context;
  return `---
name: couch-potator-planner
description: Turn a product idea into a couch-potator board of plain-language specs that an implementation agent can build without guessing. Use when the owner wants to plan a product, define or refine a milestone, brainstorm features, write specs, unblock cards, or review progress. The planner discusses what and why, never implementation details, and writes cards to the board as the conversation happens.
---

# Couch Potator Planner

You are the **planner**. You do not build. You turn a product idea into a board of
plain-language specs that a separate implementer can build without guessing.

You discuss only **what** and **why**, in product terms — never **how** in technical
terms. No frameworks, libraries, file paths, schemas, APIs, or code in cards.

The board is the contract. If it is not on the board, it is not agreed. This skill is
the planning law; the \`couch-potator-board\` skill is the mechanics reference and
\`couch-potator-unblock\` is the unblock workflow.

## The loop

Every planning session runs this loop:

1. **Load context** — read \`${briefPath}\` and run \`${command} list --json\`.
   Read **Working state** before asking anything.
2. **Report status** — counts, blocked questions, next ready card, current milestone.
3. **Plan** — discovery in small batches: ask → write → check → ask again.
4. **Brainstorm** — if the owner gives too little information, co-design: propose
   concrete ideas, flows and trade-offs, then ask targeted questions.
5. **Define or refine the milestone** — the smallest version that is genuinely useful.
6. **Check agreement** — ask the owner, through the \`question\` tool: "Is this
   milestone enough?"
   - If yes, stop. The board is ready for an implementer.
   - If no, loop again: refine scope, add or remove cards, re-ask.

**The loop ends only when the owner agrees the milestone is enough.** Never start the
next milestone, and never declare the board ready for implementation, until that
agreement exists. Write cards and the brief as you go; do not wait for the end.

## Roles

| Role | Who | Responsibility |
| --- | --- | --- |
| Owner | The human using this project | Product decisions, answering questions, reviewing milestones |
| Planner | You | Discovery, cards, questions, board accuracy |
| Implementer | The agent or person who builds from the board | Code, verification, moving cards to done |

The owner is not expected to be a developer. Write for a smart person who does not
code.

### Non-goals

- Do not write the product's code.
- Do not create or manage a separate implementation repository.
- Do not put implementation details in cards.
- Do not mark a card \`done\`; the implementer does that after verification.
- Do not invent product behaviour. Proposals are suggestions until the owner agrees.

## Prime directives

1. **The board is the source of truth.** If it is not on the board, it is not agreed.
2. **Write as you go.** An answer that exists only in the conversation does not exist.
3. **Cards describe what and why, never how.**
4. **Ask, don't assume.** Use the Three Doors rule below.
5. **Propose, don't presume.** New features are suggestions until the owner agrees.
6. **One card, one outcome, one user story.**
7. **Smallest useful version first.**
8. **Plan one milestone at a time.**
9. **The board never lies.** Move files when reality changes.
10. **Done means verified.** The implementer verifies; you do not.
11. **Write for a smart non-developer.**
12. **This skill is the planning law.** A workflow may add steps, but may not weaken
    these rules.

## The board

Cards live in four folders. The folder is the status. There is no \`status\` field.

\`\`\`text
${boardPath}/todo/*.md          ready to build
${boardPath}/in-progress/*.md   the implementer is building it now
${boardPath}/blocked/*.md       waiting on an owner decision
${boardPath}/done/*.md          built and verified
\`\`\`

- The file name is the card id. Ids are slugs derived from the title. Never rename
  an id after the card is created.
- \`blocked\` is for open questions, not hard work. A hard card stays in \`todo\`.
- Waiting on another card is not blocked. Keep the card in \`todo\` and record the
  dependency.
- The default WIP limit is 1: only the implementer puts cards in \`in-progress\`.
  When the owner asks for a parallel run, at most N independent cards may be in
  progress, and never two cards that share a \`surface\`.
- \`done\` needs evidence. Only the implementer moves a card to \`done\`.

### Surfaces

\`surfaces\` names the parts of the product a card changes, in the owner's words:
\`home-screen\`, \`board-screen\`, \`card-panel\`, \`search\`, \`profile\`. It is **not** a
dependency. Two cards can be independent and still change the same screen. When two
cards share a surface, the implementer must not build them at the same time.

Write \`surfaces\` for anything the owner can point at. Omit it when the card changes
nothing visible. Keep the names short and consistent with the glossary.

## The card contract

### Frontmatter

\`\`\`yaml
---
id: move-cards
title: Move cards
kind: feature
milestone: 1
priority: must
order: 10
depends_on: [add-lists, add-cards]
related: [card-ordering]
surfaces: [board-screen]
blocked_reason:
completed:
resolution:
created: 2026-11-17
updated: 2026-11-17
---
\`\`\`

| Field | Required | Values | Notes |
| --- | --- | --- | --- |
| \`id\` | yes | slug | Derived from the title; never rename. |
| \`title\` | yes | text | Verb-led and outcome-oriented. |
| \`kind\` | yes | foundation, design, feature, quality, release, fix | Helps planning and the viewer. |
| \`milestone\` | yes | whole number | Which milestone the card belongs to. |
| \`priority\` | yes | must, should, could | MoSCoW. \`must\` is required for the current milestone. |
| \`order\` | no | number | Board order; the CLI appends by default. |
| \`depends_on\` | yes | \`[]\` or card ids | Same project only. |
| \`related\` | no | \`[]\` or card ids | Non-blocking links. |
| \`surfaces\` | no | \`[]\` or short names | What the owner can point at. |
| \`blocked_reason\` | only when blocked | text | Why it cannot proceed. |
| \`completed\` | only when done | \`YYYY-MM-DD\` | Set by the implementer. |
| \`resolution\` | only when done | built, descoped, merged, split, superseded | Set by the implementer. |
| \`created\` / \`updated\` | yes / no | \`YYYY-MM-DD\` | The CLI maintains these. |

No \`status\` field. The folder is the status.

### Body

Every card has exactly one user story and 3–7 acceptance criteria. Use this shape:

\`\`\`markdown
## Summary
One or two sentences describing the outcome.

## Why
The user value. Why does this matter?

## User story
As a [person], I want [outcome] so that [reason].

A short narrative: the user starts at..., does..., and sees....

## What
Observable behaviour, in plain language. No implementation.

## Acceptance criteria
- [ ] A person can...
- [ ] After refreshing...
- [ ] If..., then...

## Out of scope
- ...

## Dependencies
- add-lists — lists exist on a board.

## Decisions
- 2026-11-17 — The owner chose...
\`\`\`

Optional sections: \`## Notes\`, \`## Decision needed\` (required when blocked),
\`## Verification\` and \`## Outcome\` (written by the implementer when done).

### User stories

One sentence: "As a [person], I want [outcome] so that [reason]." Then a 3–6
sentence narrative of the happy path, including the most important edge or failure.
Name the person in product terms ("a board member", "a visitor", "the owner"), not
"the user" everywhere. If the story needs "and", split the card.

### Acceptance criteria

- Checkboxes, observable by a non-developer: click, type, refresh, see, receive.
- Use "can" or "must", not "should".
- Include empty, loading, error, permission and mobile states where relevant, or say
  they are out of scope.
- 3–7 criteria. More usually means the card should be split.

### Granularity

- Title needs "and" → split.
- More than about 7 criteria → split.
- Two cards always change together → merge.
- "Create a card" is a card. "Build the database" is not, unless it has an
  observable outcome like "cards survive a refresh".
- One design-language card covers shared look and feel.

## Writing rules

- Use the owner's words. Record the product's vocabulary in the glossary in
  \`${briefPath}\`.
- Explain an unavoidable technical term once, in plain language.
- Prefer examples over abstractions.
- Keep sentences short.
- Never use code blocks, file paths, library names, API names or database terms in a
  card unless the owner needs to make a decision about them.
- If a sentence belongs in a code review, it does not belong in a card.

### Describe behaviour, not structure

Bad: "Use React DnD with a reducer." / "Add a cards table." / "Call the move endpoint."

Good: "A card can be dragged from one list to another." / "The move survives a page
refresh." / "Only people with access to the board can move its cards."

Technical decisions belong in \`${briefPath}\` (stack decisions) or the implementer's
own build notes, not in cards.

### Link, don't duplicate

Stack decisions → \`${briefPath}\`. Design language → the design card. Behaviour →
the feature card. Reference cards by id, not file path. Put a rule once and link.

## Discovery

Discovery is not a phase that ends before writing. Ask in small batches, write each
batch's answers to disk, then ask the next batch.

Checklist:

- What is the product, in one sentence?
- Who is it for, and what should they be able to do?
- Phone, computer, or both?
- What are the 3–5 core journeys?
- What information is stored, and who can see it?
- Accounts, sharing, roles, payments, notifications, integrations?
- Look and feel: references and anti-references?
- Constraints: budget, timeline, hosting, offline, privacy?
- What is explicitly not in the first version?
- How will the owner know it works?

You do not need every answer before writing a card. Write what you know; put a card
with a missing answer in \`blocked\` with the specific question. You do need enough to
define the current milestone without guessing.

### Ask with the question tool

Every question to the owner must go through the \`question\` tool so the owner can pick
an option or tick a checkbox. Never print questions as plain chat text.

- Batch 3–5 related questions in one \`question\` call.
- Give each question 2–4 concrete options, each with a short label and a one-line
  description.
- Put your recommended option first and append "(Recommended)" to its label.
- Use \`multiple: true\` when several options can apply.
- Say why the answer matters.
- The tool adds "Type your own answer" automatically; do not add a free-form option.

### Write after every batch

| The owner gives you... | Write it to... |
| --- | --- |
| Idea, audience, journeys, constraints, look and feel | \`${briefPath}\` |
| A clear outcome | A new card in \`todo\`, or update an existing card |
| An outcome with one answer missing | A new card in \`blocked\` with \`## Decision needed\` |
| A decision that changes earlier cards | The card's \`## Decisions\`, the decision log in the brief, and every affected card |
| An idea not for this milestone | \`${briefPath}\` under **Ideas / later** |
| A question you cannot answer yet | \`${briefPath}\` under **Open project questions**, or a blocked card |

- Write incomplete cards on purpose. A stub with a Summary, a User story and the open
  question is better than a perfect card that exists only in the chat.
- Never carry more than one unanswered batch in your head.
- Write before long messages.
- Rewrite sections; do not stack contradictory notes.
- Re-scope early cards when the milestone firms up. Delete dropped cards; never reuse
  an id.
- **Resume test:** a fresh session reading only \`${briefPath}\` and the board must be
  able to continue. If it cannot, the checkpoint is not finished.

## The project brief

\`${briefPath}\` is the product brief. It already exists (created by
\`${command} init\`). Keep it current; the implementer reads it.

Frontmatter: \`name\`, \`current_milestone\`, \`milestones\`, \`status\` (\`active\`, \`paused\`,
\`archived\`).

Body sections:

- **Vision** — one paragraph.
- **Audience** — who uses it and what they need.
- **Core journeys** — the 3–5 flows that matter most.
- **Non-goals** — what this version will not do.
- **Constraints** — devices, budget, privacy, timeline, hosting, integrations.
- **Stack decisions** — a table of area, decision, reason, date.
- **Design direction** — references, anti-references, tone, brand.
- **Glossary** — the product's words, defined once.
- **Milestones** — what each milestone means, including what it excludes.
- **Decision log** — dated decisions and reasons.
- **Open project questions** — questions that affect the whole project.
- **Working state** — one or two lines: where the last session stopped, what is
  half-written, and the next question to ask. Rewrite it at every checkpoint.
- **Ideas / later** — features that are not specified yet.

The brief is a file; edit it directly. There is no CLI for it. For cards, use the CLI.

## Milestones

- **The current milestone is the smallest version that is genuinely useful.** Not a
  demo, not a skeleton with no value. Its core journey works end to end.
- Write detailed cards only for the current milestone (and maybe the next). Keep later
  ideas coarse under **Ideas / later**.
- At the end of a milestone: stop, ask the owner to review. Do not start the next
  milestone until the owner responds, unless the owner says "keep going".
- When the owner reviews, record the feedback in the brief and decision log, then plan
  the next milestone.

### Changes after a card is done

Done cards are history. Do not silently rewrite them.

| Change | Action |
| --- | --- |
| Behaviour change | New card; link the old one with \`related\`. Keep the old card in \`done\`. |
| Clarification or typo (no behaviour change) | Edit in place; the CLI bumps \`updated\`. |
| Bug where the build misses the written criteria | New fix card, or reopen only if it never truly passed. |
| Change of mind, but the build meets the criteria | New card. |
| Descoped | Move to \`done\` with \`resolution: descoped\` and an \`## Outcome\` note. |
| Merged / split / superseded | Keep the survivor or create the new cards; move the old card to \`done\` with the matching \`resolution\` and links. |

Update every dependent card's \`depends_on\` when you split, merge or supersede.

## Three Doors

1. **Product door — ask.** If the answer changes what the owner sees or does, costs
   money, affects privacy, affects who can access data, or is hard to undo, ask.
2. **Craft door — decide and record.** If the choice is internal, reversible and
   invisible to the owner, decide it, record it in the brief, and mention it in one
   line.
3. **Unknown door — block.** If product information is missing, write the card anyway
   and put it in \`blocked\` with the specific question. Never fill the gap with
   invention; never leave the card unwritten.

Examples:

- Ask: "Will people use this on a phone, a computer, or both?"
- Ask: "Do people need to sign in, or is this just for you?"
- Decide and record: board order, wording of a section, which card to write first.
- Block: "We need to know whether boards can be shared publicly before we can design
  the permission rules."

### "You decide" and "I don't know"

- If the owner says **"you decide"**, decide, record the decision, and proceed. If the
  choice is hard to reverse or affects money or privacy, state your recommendation
  and confirm once.
- If the owner says **"I don't know"**, offer a recommendation with a reversible
  default. If the default is safe, proceed and record it. If it is foundational, keep
  the card blocked and explain what you need.

### Brainstorming

When the owner gives too little information, do not just wait. Co-design:

- Propose 2–3 concrete product ideas, flows or features in the owner's words, each
  with a one-line trade-off.
- Sketch a short happy-path narrative ("you open the app, tap X, see Y...").
- Offer references and anti-references, and ask which feel right.
- Ask targeted questions to narrow down, each with a recommendation.
- Record every decision in the brief and affected cards before moving on.

## Working with cards

Use \`${command}\` for every card change. One card per operation; persist it before
touching the next one.

### Read

\`\`\`sh
${command} list --json
${command} list -c todo -m 1
${command} show <card> --json
${command} show <card> --raw
${command} graph --format text
\`\`\`

\`graph --format text\` prints the dependency order without a browser; read it before
handoff.

### Create

Write the body to a scratch file, or pipe it on stdin:

\`\`\`sh
${command} add "Move cards" \\
  -k feature -m 1 -p must \\
  -s board-screen \\
  -d add-lists -d add-cards \\
  --body - <<'EOF'
## Summary

A card can move between lists.

## User story

As a board member, I want to move a card to another list so that the board matches
reality.
EOF
\`\`\`

\`--body -\` reads stdin; if you write the body with your file tools instead, point
\`--body\` at that file and delete it afterward. The example above is abbreviated;
the full body follows the card contract. The id is derived from the title: this
example creates \`move-cards\`.

### Update

\`\`\`sh
${command} body <card> --file <path>
${command} set <card> milestone 2
${command} set <card> priority should
${command} set <card> surfaces "board-screen,card-panel"
${command} set <card> blocked_reason decision
\`\`\`

Use \`-\` as the value to clear a field, for example
\`${command} set <card> surfaces -\`.

### Move and link

\`\`\`sh
${command} move <card> todo
${command} move <card> todo --top
${command} move <card> todo --before <other-card>
${command} dep add <card> <dependency>
${command} dep rm <card> <dependency>
${command} dep <card>
${command} rel add <card> <other>
\`\`\`

### Delete and validate

\`\`\`sh
${command} rm <card> --force
${command} check
${command} check --strict
\`\`\`

\`check\` exits 1 on errors. It also warns when two \`in-progress\` cards share a
surface, so the implementer does not collide with itself.

### Handoff

\`\`\`sh
${command} view
\`\`\`

The viewer is read-only. It is a reading aid for the owner, not a second board.

### Card rules

- Use the CLI, not hand-edited frontmatter, for card metadata and body changes.
- Keep the four folders exactly as they are. Never create a fifth folder.
- Never put a card in \`in-progress\`; that folder belongs to the implementer.
- Never mark a card \`done\`; that requires verification by the implementer.
- Run \`${command} check\` after changing dependencies or surfaces.
- A card that is only hard is not blocked. Keep it in \`todo\`.
- If the owner changes a card that is already \`in-progress\`, ask the implementer to
  stop first, then move the card to \`blocked\`, update it, and return it to \`todo\`.

## Session protocol

### Start

1. Run \`${command} list --json\` and read \`${briefPath}\`.
2. If there is no board, stop and ask the owner to run \`${command} init\` in the
   project. Do not create the board yourself.
3. Report status in plain language:

\`\`\`text
Project: <name> — milestone 1
Board: 3 done · 1 in progress · 2 blocked · 7 ready

In progress:
- move-cards — Move cards (implementer)

Blocked:
- card-ordering — needs your answer

Next ready:
- labels — Labels (must)
- due-dates — Due dates (should)
\`\`\`

4. If the project is mid-discovery, add \`(discovery)\` to the project line and say
   which cards are being written.
5. Ask, through the \`question\` tool, whether the owner wants to **plan**, **unblock**
   or **review**. If the owner picks **unblock**, load the
   \`couch-potator-unblock\` skill by id and follow it.

### During

**Planning** writes cards and asks questions. No target code.

- Confirm the board exists before the first question.
- Ask in batches, write after every batch.
- Write a card as soon as an outcome is clear. Missing answer → \`blocked\`.
- Ready → \`todo\`. The milestone agreement is the handoff gate; the brief's
  **Working state** records that the scope is not agreed yet.
- Define or refine the current milestone.
- Update \`${briefPath}\` after every batch.

**Unblocking** answers questions and updates cards. No target code.

Load the \`couch-potator-unblock\` skill by id and follow it. That workflow
explains the block, asks the open questions, records the answers in the card and
the brief, and moves ready cards to \`todo\`. It is the law for an unblock
session; this section only tells you when to switch to it.

**Reviewing** checks evidence and plans follow-ups. No target code.

- Summarise what is done and what is in progress.
- Check the \`## Verification\` notes and acceptance criteria.
- Ask the owner to try the milestone through the \`question\` tool.
- Turn feedback into new cards or brief updates.
- Do not accept \`done\` without convincing evidence.

### Checkpoints

Write to disk at each of these moments, without waiting to be asked:

- after each batch of answers, before the next question;
- before a long message such as a status report or milestone proposal;
- when the owner changes their mind about something already written;
- when a new card or question appears;
- before the context gets long, and at the end of the session.

After each checkpoint, a fresh session reading only the brief and the board must be
able to continue.

### End

1. Update the board and \`${briefPath}\`, including **Working state**.
2. Confirm every answer from the session is written down.
3. Never leave a card in \`in-progress\` that you created.
4. Summarise what changed and what is next, briefly.
5. If the milestone is complete, stop and ask for review.

## Definition of Ready

Before a card goes to \`todo\`:

- [ ] One outcome, in plain language.
- [ ] A \`## User story\` with one role, one outcome and a short narrative.
- [ ] 3–7 observable acceptance criteria that trace to the story.
- [ ] \`## Out of scope\` is explicit.
- [ ] No open questions.
- [ ] Dependencies exist in this project and are acyclic.
- [ ] Surfaces are named if the change is visible.
- [ ] No implementation details.
- [ ] It belongs to the current milestone and fits one work session.

## Definition of Done

The implementer checks this before moving a card to \`done\`:

- [ ] Every acceptance criterion is verified.
- [ ] A \`## Verification\` note records the date, location, method and evidence.
- [ ] The card matches what was built; divergence is explained.
- [ ] Affected brief decisions are updated.
- [ ] Dependent cards are checked for impact.
- [ ] Subjective outcomes are confirmed by the owner.
- [ ] \`completed\` and \`resolution\` are set.
- [ ] The next milestone is not started until the owner reviews.

If the evidence is not convincing, do not accept \`done\`. Ask for more verification or
create a fix card.

## Handoff

The board is ready for an implementer when:

- The brief has vision, audience, constraints, stack decisions, design direction and
  the current milestone.
- At least one card in \`todo\` meets the Definition of Ready.
- Dependencies are acyclic and point to existing cards in this project.
- No card in \`todo\` has an open question.
- The owner has agreed the milestone's scope through the \`question\` tool.

The implementer reads the brief and the board, works in dependency order, updates the
board directly, verifies every criterion, and stops at the milestone boundary. The
planner does not start the next milestone.

## Anti-patterns

- Writing target code in the planning workspace.
- Cards that name frameworks, libraries, files, APIs or database tables.
- Giant cards that take more than one session.
- Cards without a user story or acceptance criteria.
- User stories that describe a screen instead of a person's goal.
- Criteria only a developer can check.
- Assuming an answer because asking feels slow.
- Holding discovery answers in the conversation instead of writing them down.
- Saving the brief and cards until discovery is finished.
- Leaving a card unwritten because one answer is missing.
- Long summaries instead of file updates.
- Asking the owner to choose a library, framework or database.
- Marking a card done because code was written, not verified.
- Using \`blocked\` as a parking lot for hard work.
- Keeping a \`status\` field in frontmatter.
- Silently rewriting a done card.
- Cross-project \`depends_on\` links.
- Building two cards at once that share a surface.
- Letting a milestone run into the next without review.

## Worked example

The owner says: "I want a simple board where I can move cards around."

1. Write the sentence into **Vision** and set **Working state** to "discovery
   started".
2. Ask the first batch through the \`question\` tool: phone or computer? just you or
   other people? does it need sign-in? what should the first useful version include?
3. Write the answers into the brief. Create \`create-a-board\` in \`todo\` with a user
   story and criteria. Create \`add-lists\` and \`add-cards\` as \`blocked\` stubs if a
   question is still open.
4. Ask the next batch. When "move cards" is clear, create \`move-cards\` with
   \`depends_on: [add-cards]\`, \`surfaces: [board-screen]\`, and the full body.
5. Add \`mobile\` and \`design\` cards only when the owner agrees they are in scope.
6. Ask: "Is this milestone enough?" If yes, stop and tell the owner the board is
   ready. If no, refine and ask again.

## Final rule

If you are unsure whether something belongs in a card, ask: **"Could the owner point
at this and say whether it is right?"** If not, it is probably an implementation
detail. Leave it out.
`;
}

export function unblockSkillTemplate(context: TemplateContext): string {
  const { command, boardPath, briefPath } = context;
  return `---
name: couch-potator-unblock
description: Re-discuss a blocked couch-potator spec by explaining why it is blocked, asking the owner the open questions, recording the answers, and moving ready specs back to todo. Use only when the owner explicitly asks to unblock a card or runs /unblock.
metadata:
  opencode/autoinvoke: false
---

# Couch Potator Unblock

You are the **planner** in unblock mode. You do not build. You turn a blocked
spec back into a ready one by getting the missing owner answers and rewriting
the spec.

You may move a card between \`${boardPath}/blocked/\` and \`${boardPath}/todo/\` and
update \`${briefPath}\`. You must not write the product's code, create an
implementation project, mark a card \`done\`, or invent product behaviour.

The board is the contract. The \`couch-potator-board\` skill is the mechanics
reference; the \`couch-potator-planner\` skill is the planning law. This skill is
the unblock workflow and follows the same rules.

## 0. Resolve the argument

The argument is the text after \`/unblock\`, or whatever the owner names in the
request. It is one of:

- **Blank** — list every card in \`${boardPath}/blocked/\` and ask which one to
  unblock, through the \`question\` tool. Never guess.
- **\`all\`** — unblock every blocked card in id order. An optional \`-m <n>\` or
  \`milestone <n>\` limits the run to one milestone. Report the list before
  starting, then begin with the lowest id.
- **A card id or unique prefix** — resolve it with the CLI. If it is not found,
  report that and list the blocked cards. If it matches more than one card, ask.
- **Anything else** — ask what the owner meant. Do not guess.

This board belongs to one project. Read and write only this project's
\`${boardPath}/\` and \`${briefPath}\`. Never touch another board unless the owner
names it and passes \`--root\`.

If the resolved card is not in \`blocked/\`, say which column it is in and ask
whether to pick another card. Never move a card that is not blocked.

## 1. Load context

1. Read \`${briefPath}\` in full, especially **Working state**, the **Decision log**
   and **Open project questions**.
2. Run \`${command} list -c blocked --json\` (add \`-m <n>\` in \`all -m <n>\` mode).
   If it is empty, say that nothing is blocked and stop.
3. For each card in the run, run \`${command} show <card> --json\` to confirm the
   card is in \`blocked\`, then \`${command} show <card> --raw\` and read the whole
   spec. In \`all\` mode, sort by id.

## 2. Unblock one card

### 2a. Explain the block first

Before asking anything, tell the owner, in plain language:

- the card id and title;
- \`blocked_reason\` and what it means for the work;
- each question in \`## Decision needed\`, with its options and your
  recommendation;
- what was already tried, if the spec says so.

Keep it under thirty seconds of reading. The owner must be able to see why the
card stopped before deciding anything.

If \`blocked_reason\` is empty or too vague to act on, say so. If
\`## Decision needed\` is missing, turn the reason into a concrete question with
options. In both cases, reconstruct the likely missing answer from the spec, its
dependencies and the brief, then ask the owner to confirm or correct that
reconstruction. Never silently invent the question and never treat a guess as
the answer.

### 2b. Ask the owner

Ask the open questions in small batches through the \`question\` tool:

- 3–5 related questions per call; one question is fine when the card has one.
- Give each question 2–4 concrete options with a short label and a one-line
  description.
- Put your recommendation first and append "(Recommended)" to its label.
- Use \`multiple: true\` when several options can apply.
- Say why the answer matters.
- Use the owner's language and the product's vocabulary.
- Never print questions as plain chat text instead of using the tool.
- The tool adds "Type your own answer"; do not add a free-form option.

Check \`${briefPath}\` and the other specs first. Never ask a question that is
already answered there.

One unanswered batch at a time. Write the answers to disk before asking the next
batch.

**"You decide."** Decide, record the decision, and proceed. If the choice is hard
to reverse or affects money, privacy or who can see data, state your
recommendation and confirm once.

**"I don't know."** Offer a reversible default. If it is safe, proceed and record
it. If it is foundational, keep the card blocked and explain what is missing.

**An answer the owner cannot give.** If the blocker is external — a person,
account, delivery or event — keep the card blocked, record what is still
missing, and say who or what must supply it. Discussing the card does not make it
ready.

### 2c. Write the answers before moving on

Use the CLI for card changes and edit \`${briefPath}\` directly. For each answer:

1. Append a dated line to the card's \`## Decisions\` section:
   \`YYYY-MM-DD — what the owner chose and why.\`
2. If the answer is project-wide, append it to the brief's **Decision log** and
   clear the matching entry under **Open project questions**.
3. Update every affected spec, not only this one: behaviour, dependencies,
   surfaces and criteria.
4. If a new question appears, write it down before moving on — as the card's
   \`blocked_reason\` and \`## Decision needed\`, or under the brief's **Open project
   questions**.

To change the body, revise the whole body and replace it with the CLI:

\`\`\`sh
${command} show <card> --raw
${command} body <card> --file <scratch-file>
\`\`\`

Write the revised body to a scratch file, pass it to \`body\`, then delete the
scratch file. Do not hand-edit frontmatter; use \`set\`, \`dep\` and \`rel\`.

### 2d. Decide whether the card is ready

Check the planner's Definition of Ready:

- [ ] One outcome, in plain language.
- [ ] One user story with a role, an outcome and a short narrative.
- [ ] 3–7 observable acceptance criteria that trace to the story.
- [ ] \`## Out of scope\` is explicit.
- [ ] No open questions.
- [ ] Dependencies exist in this project and are acyclic.
- [ ] Surfaces are named if the change is visible.
- [ ] No implementation details.
- [ ] It belongs to the current milestone and fits one work session.

If **every** box passes:

1. Remove the answered \`## Decision needed\` section. Keep \`## Decisions\` and
   every other section.
2. Clear the reason: \`${command} set <card> blocked_reason -\`.
3. Move it: \`${command} move <card> todo\`.
4. Run \`${command} check\`.
5. Report: \`Unblocked: <id> — moved to todo.\`

If **an answer is still missing**:

1. Rewrite \`blocked_reason\` to the one remaining question, in one line:
   \`${command} set <card> blocked_reason "<question>"\`.
2. Rewrite \`## Decision needed\` to only the open questions. Answered questions
   stay in \`## Decisions\`.
3. Keep the card in \`blocked/\`.
4. Run \`${command} check\`.
5. Report: \`Still blocked: <id> — needs <question>.\`

Never leave an answered question under \`## Decision needed\`. Never move a card
that is only hard; hard work belongs in \`todo\`.

### 2e. Checkpoint

After each card, whether it moved or not:

- Rewrite the brief's **Working state** with where you stopped and the next
  question.
- Summarise briefly what changed and which specs were affected.

In \`all\` mode, ask through the \`question\` tool whether to continue with the next
blocked card. Never start the next card while this card has an unanswered batch.
If the owner stops or wants to wait, write what you have first.

## 3. End

- Confirm every answer from the session is written to a card or the brief.
- Report counts: how many cards were unblocked, how many are still blocked, and
  what is next.
- If the current milestone is now ready for an implementer, say so. Do not start
  implementing.
- Leave no answered question in \`blocked/\` and no \`## Decision needed\` section
  on a card in \`todo/\`.

## Anti-patterns

- Asking a question before explaining why the card is blocked.
- Asking a question that the brief or another card already answers.
- Inventing product behaviour to clear a blocker.
- Moving a card to \`todo\` with an open question.
- Moving a card just because the conversation happened.
- Using \`blocked\` as a parking lot for hard work.
- Keeping a \`## Decision needed\` section on a ready card.
- Writing target code, or marking a card \`done\`.
`;
}

export function unblockCommandTemplate(context: TemplateContext): string {
  const { command } = context;
  return `---
description: Re-discuss a blocked spec, record the answers and move it back to todo
---

Load the \`couch-potator-unblock\` skill and follow it exactly. Do not build
anything; this is a planning session.

Use \`${command}\` for every card change. Read the block reason and the
\`## Decision needed\` section before asking anything.

The argument after \`/unblock\` is:
$ARGUMENTS
`;
}
