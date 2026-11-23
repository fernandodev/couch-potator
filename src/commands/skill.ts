import { detectInstalledTargets, installAgentFiles, parseInstallTarget } from "../agent.js";
import { cyan, dim, green, yellow } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";

const OPTIONS = {
  force: { type: "boolean" as const, short: "f" },
  update: { type: "boolean" as const },
  target: { type: "string" as const },
  root: ROOT_OPTION,
};

export async function skillCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const explicit = positionals[0];
  if (explicit !== undefined && explicit !== "install" && explicit !== "update") {
    throw new UsageError(`Unknown skill action "${explicit}".`, {
      details: [
        "couch-potator skill install [--target opencode|claude|both] [--force]",
        "couch-potator skill update [--target opencode|claude|both]",
        "couch-potator skill --update",
      ],
    });
  }
  if (flag(values, "update") && explicit === "install") {
    throw new UsageError('Use either "update" or --update, not both.');
  }

  const update = flag(values, "update") || explicit === "update";
  const root = resolveRoot(text(values, "root"));
  const requested = text(values, "target");

  let target = parseInstallTarget(requested);
  if (update && requested === undefined) {
    const installed = detectInstalledTargets(root);
    if (!installed.length) {
      throw new UsageError("No couch-potator agent files found in this project.", {
        details: [
          "Run `couch-potator init` or `couch-potator skill install` first, or pass --target.",
        ],
      });
    }
    target = installed.length > 1 ? "both" : (installed[0] ?? "opencode");
  }

  const result = installAgentFiles(root, {
    force: flag(values, "force"),
    update,
    target,
  });

  for (const file of result.written) console.log(`${green("wrote")} ${cyan(file)}`);
  for (const file of result.updated) console.log(`${green("updated")} ${cyan(file)}`);
  for (const file of result.removed) console.log(`${yellow("removed")} ${cyan(file)}`);
  for (const file of result.skipped) {
    console.log(`${dim(update ? "up to date" : "kept")} ${dim(file)}`);
  }

  if (!result.written.length && !result.updated.length && !result.removed.length) {
    console.log(
      dim(update ? "Everything is up to date." : "Nothing to do. Pass --force to rewrite."),
    );
  }
  return 0;
}
