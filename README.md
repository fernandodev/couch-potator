# couch-potator

A folder-backed spec board for one project, with a read-only browser viewer,
milestones and a dependency graph.

No database, no server, no background process. The board is a directory of
markdown files, and the viewer is a single generated HTML file you open with
`file://`.

```text
board/
├── todo/*.md
├── in-progress/*.md
├── blocked/*.md
└── done/*.md
```

Each card is a spec: the folder is its status, the file name is its id, the
frontmatter is its metadata, and the body is the spec itself. Your editor, your
diff, and `grep` all work on it.

## Install

```sh
npm install -g couch-potator
# or run it without installing
npx couch-potator --help
```

Node 20 or newer.

## Quick start

Run this inside the project you are building:

```sh
couch-potator init
couch-potator add "Reduce cold start" -k feature -m 1
couch-potator move reduce-cold-start in-progress
couch-potator view
```

`init` creates:

```text
board/{todo,in-progress,blocked,done}/
PROJECT.md                          # name, current milestone, brief
.couch-potator/config.json          # paths
.couch-potator/templates/card.md    # body used by `add`
.opencode/skills/board/SKILL.md     # agent instructions
AGENTS.md                           # managed board block
```

`.couch-potator/viewer/` is appended to `.gitignore`. Commit `board/`,
`PROJECT.md` and the config; leave the generated page out.

## Commands

| Command | Effect |
| --- | --- |
| `couch-potator init [--name <n>] [--no-skill]` | Scaffold a board in the current folder. Idempotent; never overwrites `PROJECT.md`. |
| `couch-potator add "<title>" [-c todo] [-k feature] [-m 1] [-p high] [-d <card>]... [-r <card>]... [--body <file\|->]` | Create a card. `-c` accepts `wip`/`inprogress` as aliases for `in-progress`. |
| `couch-potator list [-c <col>] [-m <n>] [-k <kind>] [--all] [--json] [--ids]` | List cards, sorted by status, then `order`, then title. |
| `couch-potator show <card> [--raw\|--path\|--json]` | Print a spec. `<card>` may be an id or a unique prefix. |
| `couch-potator move <card> <column> [--top\|--bottom\|--before <card>\|--after <card>]` | Move a card and renumber both columns. |
| `couch-potator set <card> <field> <value>` | Set `kind`, `milestone`, `priority`, `order`, `title`, `blocked_reason`, `resolution`, `completed`. Use `-` to clear. |
| `couch-potator dep add\|rm <card> <card>` / `dep <card>` | Edit or list `depends_on`. Cycles are rejected. |
| `couch-potator rel add\|rm <card> <card>` / `rel <card>` | Edit or list `related`. |
| `couch-potator edit <card>` | Open the spec in `$VISUAL`/`$EDITOR`. |
| `couch-potator rm <card> [--force]` | Delete a card. |
| `couch-potator check [--strict] [--json]` | Validate ids, links, cycles, orders and columns. Exit 1 on errors. |
| `couch-potator graph [--format text\|mermaid\|dot] [-m <n>]` | Print the dependency graph without a browser. |
| `couch-potator view [--watch] [--no-open] [--milestone <n\|all>] [--out <path>]` | Generate and open the read-only viewer. |
| `couch-potator skill install [--force]` | (Re)install the OpenCode skill and the `AGENTS.md` block. |

Global: `--root <path>` anywhere, `--help`, `--version`.

Exit codes: `0` success, `1` invalid board or failed validation, `2` usage error
(unknown card, unknown column, bad flag).

## Card format

```markdown
---
id: reduce-cold-start
title: Reduce cold start
kind: feature            # foundation | design | feature | quality | release | fix
milestone: 1
priority: high
order: 10
depends_on: [warm-pool]
related: [latency-budget]
blocked_reason:
completed:
resolution:
created: 2026-11-16
updated: 2026-11-16
---

## Why

...
```

Unknown frontmatter keys are preserved on every write. `status` is never stored —
the folder is the status.

## Milestones

Milestones are whole numbers. The set in the viewer is the union of the values in
`PROJECT.md` (`current_milestone` and the optional `milestones: [1, 2]` list) and
the `milestone` of every card, so you can declare a milestone before its first
card.

The viewer opens on `current_milestone`, falling back to the newest milestone.
The header dropdown filters cards and graph together; the choice is kept in the
URL hash. Cards with no milestone only appear under **All milestones**.

## Dependency graph

`A depends_on B` draws an arrow from `B` to `A` — the arrow points at the
dependent card. The graph is layered left to right by longest path, and hovering a
node dims everything except its neighbours.

When a milestone is selected, specs from other milestones that a visible card
depends on (or that depend on it) stay in the graph, drawn faded with dashed
edges, so cross-milestone dependencies remain traceable.

`related` is not drawn as an edge; it appears as chips in the spec modal.

## The viewer

`couch-potator view` writes one self-contained file to
`.couch-potator/viewer/board.html`:

- cards grouped into the four columns, titles only, coloured by `kind`
- clicking a card opens the rendered spec with metadata chips, clickable
  `depends_on` / `related` links, and the file path
- `Brief` opens `PROJECT.md`
- `Cards` / `Graph` toggle
- `Reload` re-reads the file after you regenerate it

It is structurally read-only: there is no server, no `fetch`, no write endpoint
and no drag handler. Markdown is rendered with marked and sanitised with
DOMPurify, both inlined into the page.

`--watch` keeps the process alive and rebuilds the page whenever `board/` or
`PROJECT.md` changes; the browser does not poll, so press `Reload`.

## Agents

`init` writes `.opencode/skills/board/SKILL.md` and a managed block in
`AGENTS.md`. Both point at the CLI, so an agent can read the board with
`list --json`, create cards, move them, link dependencies and validate with
`check` instead of hand-editing YAML.

`couch-potator skill install --force` rewrites both files.

## Design notes

- **No SQLite.** The directory tree is the index and frontmatter is the metadata.
  Thousands of cards scan in milliseconds, and there is nothing to invalidate.
- **No web server.** The viewer used to need one to serve live data. A generated
  single-file page does the same job over `file://`, with no ports, no daemon, no
  "already running" state and no stale-server failure mode. The cost is that
  regeneration is explicit.
- **Files are the source of truth.** The viewer never writes, and no command
  rewrites a spec body.

## Development

```sh
npm install
npm run build     # bundle to dist/ and copy viewer assets
npm test          # vitest
npm run typecheck
npm run check     # typecheck + tests + build
```

The viewer assets live in `src/viewer/assets/`; `scripts/build-assets.mjs` copies
them and the marked/DOMPurify bundles into `dist/assets/` so the published
package has no runtime frontend dependency.
