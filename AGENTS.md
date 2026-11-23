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

## Branch, merge through a pull request

Every implementation, however small, follows the same loop: branch from a fresh
`main`, make the change and commit it, open the pull request and merge it once
the checks pass, then update local `main` and continue from that fresh branch
with everything pulled. Never implement directly on `main` and never leave
finished work sitting on an unmerged branch.

`main` is protected: the `Node 20`, `Node 22` and `Node 24` checks must pass,
strict mode requires the branch to be up to date, and admin enforcement is on.
Never commit or push to `main` directly; every change lands through a pull
request, including docs and release bumps.

1. Start from an up-to-date `main` and create a branch named
   `<type>/<slug>` with the conventional type, for example
   `feat/claude-agents`, `fix/viewer-reload` or `docs/readme-screenshots`:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c <type>/<slug> main
   ```

2. Commit the work, run `npm run check`, then push and open the PR:

   ```sh
   git push -u origin HEAD
   gh pr create --base main --fill
   ```

3. Wait for the checks, then merge with a merge commit:

   ```sh
   gh pr checks --watch
   gh pr merge --merge
   ```

   Use `--merge`, not `--squash` or `--rebase` on a branch that carries a
   version tag: the `vX.Y.Z` tag points at the release commit, and a merge
   commit keeps that commit reachable from `main`.

4. Update local `main` and delete the merged branch:

   ```sh
   git switch main
   git pull --ff-only
   git branch -d <type>/<slug>
   git push origin --delete <type>/<slug>
   ```

Rules:

- Do not merge the PR until every intended commit is pushed. Merging early
  leaves the later commits and their tags outside `main` (PR #3 merged before
  the Claude Code feature and `v0.7.0` release were pushed).
- If `main` moved and strict checks block the PR, merge `main` into the branch
  (`git merge origin/main`) instead of rebasing when a pushed tag points into
  the branch. Never rewrite or force-push `main` or a pushed tag.
- Do not push a tag until its commit is on `main`; see below.

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
  `chore(release): vX.Y.Z` and tag that commit locally:

  ```sh
  git tag vX.Y.Z
  ```

- Push the branch, open the release PR and merge it as described above, then
  push the tag to the merged commit:

  ```sh
  git push origin vX.Y.Z
  ```

- Create the GitHub release as well as the tag. A tag alone leaves the
  Releases page behind and hides the change list from users:

  ```sh
  gh release create vX.Y.Z --title vX.Y.Z --notes-file <notes>
  ```

  Write the notes from the release PR body and the commits since the previous
  tag: a one-line summary, then a short paragraph and `-` bullets for the
  user-facing changes. Do not paste the commit subjects. The newest release
  becomes `Latest` automatically, so tag and release must always land together.

- Do not move or reuse a tag after it is pushed.

## Publish after a version bump

Publish only after the release PR with the `chore(release): vX.Y.Z` bump is
merged into `main`, so the published code, the tag and `main` agree.

1. Confirm `main` has the version, the tag is reachable from it and the
   GitHub release exists:

   ```sh
   git switch main
   git pull --ff-only
   node -p "require('./package.json').version"
   git merge-base --is-ancestor vX.Y.Z main
   gh release view vX.Y.Z
   ```

2. Publish and verify:

   ```sh
   npm publish
   npm view couch-potator version
   ```

   `prepublishOnly` reruns `npm run check`, and `files` limits the package to
   `dist/`. Never publish a version that already exists on npm; bump instead.
   If `npm whoami` fails, stop and ask the owner to authenticate with
   `npm login` rather than guessing credentials.

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
managed instruction block. They support `--target opencode`, `claude` or `both`
and write `.opencode/` + `AGENTS.md` or `.claude/` + `CLAUDE.md` respectively.
Their content lives in `src/templates.ts`.

When changing generated files:

- edit the template, never a generated copy in a target project;
- update the README and the tests in the same commit;
- keep `couch-potator-unblock` and `couch-potator-implement` hidden with
  `metadata.opencode/autoinvoke: false` for OpenCode and
  `disable-model-invocation: true` for Claude Code unless the owner explicitly
  decides otherwise;
- keep the installed commands at `.opencode/commands/` and `.claude/commands/`
  (plural `commands/`; the singular `command/` directory is legacy);
- keep the subagents at `.opencode/agents/` with `mode: subagent` and at
  `.claude/agents/` with a `name`; do not mark them hidden, because the
  implement skill has to launch them.

## Rule of thumb

If it is not committed, it is not done. If a change is worth shipping, it is
worth a version bump.
