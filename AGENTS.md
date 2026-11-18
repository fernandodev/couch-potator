# AGENTS.md

Instructions for agents working in this repository.

## Project

`couch-potator` is a TypeScript CLI that turns a folder tree into a spec board.
Source lives in `src/`, tests in `tests/`, and the content of generated agent
files in `src/templates.ts`. `dist/` is a build artifact and is gitignored.

## Checks

Run `npm run check` before every commit. It runs the typecheck, the tests and
the build.

## Commit every change

- Commit each coherent change as soon as `npm run check` passes. Do not leave
  finished work uncommitted.
- One logical change per commit. If the working tree has unrelated edits, stage
  only the files that belong to the current change.
- Use conventional commit subjects:
  - `feat: ...` for a user-facing feature
  - `fix: ...` for a bug fix
  - `docs: ...` for documentation only
  - `refactor: ...` for behavior-preserving code changes
  - `test: ...` for tests only
  - `chore: ...` for tooling and dependencies
  - `chore(release): vX.Y.Z` for a version bump
- Explain the why in the body when the subject is not enough. Do not use
  `--no-verify` to skip checks.

## Bump versions regularly

- Bump after every couple of user-facing features, and for any release-worthy
  fix.
- Bump `minor` for new features (a new command, skill or flag) and `patch` for
  fixes and docs-only releases.
- Bump without letting npm create its own commit and tag:

  ```sh
  npm version minor --no-git-tag-version
  ```

- Commit `package.json` and `package-lock.json` together as
  `chore(release): vX.Y.Z`, then tag that commit:

  ```sh
  git tag vX.Y.Z
  ```

- Do not move or reuse a tag after it is pushed.

## Install the local build

After a version bump, and after any change that affects `dist/`, rebuild and
link the command:

```sh
npm run build
npm link
```

`npm link` points the global `couch-potator` command at this checkout. Never
commit `dist/` or a packed `.tgz`.

## Generated agent files

`couch-potator init` and `couch-potator skill install` write the board, planner,
unblock and implement skills, the `/unblock` and `/implement` commands, the
`couch-potator-implementer` and `couch-potator-integrator` subagents and the
managed block in target projects' `AGENTS.md`. Their content lives in
`src/templates.ts`.

When changing generated files:

- edit the template, never a generated copy in a target project;
- update the README and the tests in the same commit;
- keep `couch-potator-unblock` and `couch-potator-implement` hidden with
  `metadata.opencode/autoinvoke: false` unless the owner explicitly decides
  otherwise;
- keep the installed commands at `.opencode/commands/unblock.md` and
  `.opencode/commands/implement.md` (plural `commands/`; the singular `command/`
  directory is legacy);
- keep the subagents at `.opencode/agents/` with `mode: subagent`; do not mark
  them hidden, because the implement skill has to launch them.

## Rule of thumb

If it is not committed, it is not done. If a change is worth shipping, it is
worth a version bump.
