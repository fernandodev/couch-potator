# couch-potator

A folder-backed spec board for one project, with a read-only browser viewer,
milestones, a dependency graph, and a planner skill that turns an idea into
plain-language specs.

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

This is a local release: it is **not on the npm registry yet**. Install it from
a checkout:

```sh
npm install
npm run build
npm link            # exposes the `couch-potator` command on your PATH
```

Then run `couch-potator init` inside the project you are building. To skip the
global link, use `node /path/to/couch-potator/dist/cli.js <command>`.

Once published, `npm install -g couch-potator` and `npx couch-potator` will work
as usual.

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
PROJECT.md                                       # name, current milestone, brief
.couch-potator/config.json                       # paths
.couch-potator/templates/card.md                 # full spec body used by `add`
.opencode/skills/couch-potator-board/SKILL.md    # board mechanics for agents
.opencode/skills/couch-potator-planner/SKILL.md  # product planning for agents
AGENTS.md                                        # managed board block
```

`PROJECT.md` is never overwritten by `init`. The planner fills it in during
discovery; the full scaffold covers vision, audience, journeys, constraints, stack
decisions, design direction, glossary, milestones, decisions, open questions,
working state and later ideas.

`.couch-potator/viewer/` is appended to `.gitignore`. Commit `board/`,
`PROJECT.md` and the config; leave the generated page out.

## Commands

| Command | Effect |
| --- | --- |
| `couch-potator init [--name <n>] [--no-skill]` | Scaffold a board in the current folder. Idempotent; never overwrites `PROJECT.md`. |
| `couch-potator add "<title>" [-c todo] [-k feature] [-m 1] [-p must] [-s <surface>]... [-d <card>]... [-r <card>]... [--body <file\|->]` | Create a card. `-c` accepts `wip`/`inprogress` as aliases for `in-progress`. `-s` may be repeated or comma-separated. |
| `couch-potator list [-c <col>] [-m <n>] [-k <kind>] [--all] [--json] [--ids]` | List cards, sorted by status, then `order`, then title. |
| `couch-potator show <card> [--raw\|--path\|--json]` | Print a spec. `<card>` may be an id or a unique prefix. |
| `couch-potator body <card> --file <file\|->` | Replace a card body. Use `-` to read stdin. |
| `couch-potator move <card> <column> [--top\|--bottom\|--before <card>\|--after <card>]` | Move a card and renumber both columns. |
| `couch-potator set <card> <field> <value>` | Set `kind`, `milestone`, `priority`, `order`, `title`, `surfaces`, `blocked_reason`, `resolution`, `completed`. Use `-` to clear. |
| `couch-potator dep add\|rm <card> <card>` / `dep <card>` | Edit or list `depends_on`. Cycles are rejected. |
| `couch-potator rel add\|rm <card> <card>` / `rel <card>` | Edit or list `related`. |
| `couch-potator edit <card>` | Open the spec in `$VISUAL`/`$EDITOR`. |
| `couch-potator rm <card> [--force]` | Delete a card. |
| `couch-potator check [--strict] [--json]` | Validate ids, links, cycles, orders, columns and in-progress surface collisions. Exit 1 on errors. |
| `couch-potator graph [--format text\|mermaid\|dot] [-m <n>]` | Print the dependency graph without a browser. |
| `couch-potator view [--watch] [--no-open] [--milestone <n\|all>] [--out <path>]` | Generate and open the read-only viewer. |
| `couch-potator skill install [--force]` | (Re)install both OpenCode skills and the `AGENTS.md` block. |
| `couch-potator completion [install] [bash\|zsh\|fish]` | Print or install shell completions (`sh` maps to bash). |

Global: `--root <path>` anywhere, `--help`, `--version`.

Exit codes: `0` success, `1` invalid board or failed validation, `2` usage error
(unknown card, unknown column, bad flag).

## Planning with an agent

`init` installs two OpenCode skills:

| Skill | Job |
| --- | --- |
| `couch-potator-board` | Board mechanics: read, add, body, move, link, validate, view. |
| `couch-potator-planner` | Product planning: discovery, specs, milestones, questions, review. |

The planner is the product manager. It does not write your product's code. It:

- reads `PROJECT.md` and the board before every session;
- asks the owner questions in small batches through OpenCode's `question` tool,
  with concrete options and a recommendation;
- writes cards and the brief as the answers arrive, not at the end;
- uses `couch-potator` for every card change;
- puts ready cards in `todo/` and cards with an open question in `blocked/`;
- stops when the owner agrees the current milestone is enough.

It discusses only what and why. Frameworks, libraries, file layout and code belong to
the implementer, not the planner. The card body is a plain-language spec: one user
story, 3–7 observable acceptance criteria, explicit out-of-scope, dependencies and
decisions.

To use it, start an OpenCode session in the project and ask the planner to plan the
product or the next milestone. If the board is missing, run `couch-potator init`
first. The planner will tell you the same.

## Shell completions

Install completions for the shell you use:

```sh
couch-potator completion install fish
couch-potator completion install zsh
couch-potator completion install bash
```

`completion` with no `install` prints the script instead, and `--print` forces
printing even with `install`. Use `--no-rc` to write the script without touching
your shell startup files.

| Shell | File | Wiring |
| --- | --- | --- |
| fish | `~/.config/fish/completions/couch-potator.fish` | Loaded automatically by fish. |
| zsh | `~/.config/couch-potator/completion.zsh` | Managed block in `~/.zshrc`. |
| bash | `~/.local/share/bash-completion/completions/couch-potator` | Managed block in `~/.bashrc`. |

The install is idempotent: rerunning it rewrites the script but keeps a single
managed block, delimited by `# >>> couch-potator completions >>>` and
`# <<< couch-potator completions <<<`. Restart the shell (or open a new tab) after
installing.

Completions are dynamic: the scripts call a hidden `__complete` command, so card
ids, milestones, columns, kinds, formats and flags come from the board you are
standing in. A missing or broken board never breaks the shell; you simply get
commands and flags.

To wire a script by hand:

```sh
source <(couch-potator completion bash)
source <(couch-potator completion zsh)
couch-potator completion fish > ~/.config/fish/completions/couch-potator.fish
```

## Card format

```markdown
---
id: reduce-cold-start
title: Reduce cold start
kind: feature            # foundation | design | feature | quality | release | fix
milestone: 1
priority: must           # must | should | could
order: 10
depends_on: [warm-pool]
related: [latency-budget]
surfaces: [cold-start]   # what the owner can point at
blocked_reason:
completed:
resolution:
created: 2026-11-16
updated: 2026-11-16
---

## Summary

...

## User story

As a..., I want..., so that....

## Acceptance criteria

- [ ] ...
```

Unknown frontmatter keys are preserved on every write. `status` is never stored —
the folder is the status. `surfaces` is not a dependency: two cards can be independent
and still change the same screen. `check` warns when two `in-progress` cards share a
surface.

`add` reads the default body from `.couch-potator/templates/card.md`. The seeded
template is the full spec contract: Summary, Why, User story, What, Acceptance
criteria, Out of scope, Dependencies and Decisions. Edit that file to change the
default, or pass `--body <file>` / use `couch-potator body <card> --file <file>` to
write a specific spec.

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

`related` and `surfaces` are not drawn as edges; they appear as chips in the spec
modal.

## The viewer

`couch-potator view` writes one self-contained file to
`.couch-potator/viewer/board.html`:

- cards grouped into the four columns, titles only, coloured by `kind`
- clicking a card opens the rendered spec with metadata chips, clickable
  `depends_on` / `related` links, `surfaces` chips, and the file path
- `Brief` opens `PROJECT.md`
- `Cards` / `Graph` toggle
- `Reload` re-reads the file after you regenerate it

It is structurally read-only: there is no server, no `fetch`, no write endpoint
and no drag handler. Markdown is rendered with marked and sanitised with
DOMPurify, both inlined into the page.

`--watch` keeps the process alive and rebuilds the page whenever `board/` or
`PROJECT.md` changes; the browser does not poll, so press `Reload`.

## Agents

`init` writes two skills and a managed block in `AGENTS.md`:

| File | Purpose |
| --- | --- |
| `.opencode/skills/couch-potator-board/SKILL.md` | Board mechanics: CLI commands, viewer, validation rules. |
| `.opencode/skills/couch-potator-planner/SKILL.md` | Product planning: discovery, spec contract, milestones, session protocol. |
| `AGENTS.md` | A short managed block pointing every agent at the CLI and the two skills. |

All three point at the CLI, so an agent can read the board with `list --json`,
create cards, replace bodies, move them, link dependencies and validate with
`check` instead of hand-editing YAML. The planner skill is the planning law; the
board skill is the mechanics reference.

`couch-potator skill install --force` rewrites all three files.

## Design notes

- **No SQLite.** The directory tree is the index and frontmatter is the metadata.
  Thousands of cards scan in milliseconds, and there is nothing to invalidate.
- **No web server.** The viewer used to need one to serve live data. A generated
  single-file page does the same job over `file://`, with no ports, no daemon, no
  "already running" state and no stale-server failure mode. The cost is that
  regeneration is explicit.
- **Files are the source of truth.** The viewer never writes. The CLI can rewrite a
  spec body only through the explicit `body` command.

## Development

```sh
npm install
npm run build     # esbuild bundle to dist/ and copy viewer assets
npm test          # Node's test runner over tests/*.test.ts
npm run typecheck
npm run check     # typecheck + tests + build
```

The bundle is one `esbuild` invocation (`scripts/build.mjs`). Tests are bundled
with the same esbuild and executed by `node --test` (`scripts/test.mjs`), so the
dev toolchain is esbuild plus TypeScript — no separate bundler or test framework
to keep patched.

The viewer assets live in `src/viewer/assets/`; `scripts/build-assets.mjs` copies
them and the marked/DOMPurify bundles into `dist/assets/` so the published
package has no runtime frontend dependency.

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Fernando Martinez.

