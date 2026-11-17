import { installAgentFiles } from "../agent.js";
import { cyan, dim, green, yellow } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveRoot } from "../config.js";
import { UsageError } from "../errors.js";

const OPTIONS = {
  force: { type: "boolean" as const, short: "f" },
  root: ROOT_OPTION,
};

export async function skillCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const sub = positionals[0] ?? "install";
  if (sub !== "install") {
    throw new UsageError(`Unknown skill action "${sub}".`, {
      details: ["couch-potator skill install [--force]"],
    });
  }

  const root = resolveRoot(text(values, "root"));
  const result = installAgentFiles(root, { force: flag(values, "force") });

  for (const file of result.written) console.log(`${green("wrote")} ${cyan(file)}`);
  for (const file of result.removed) console.log(`${yellow("removed")} ${cyan(file)}`);
  for (const file of result.skipped) console.log(`${dim("kept")} ${dim(file)}`);
  if (!result.written.length && !result.removed.length) {
    console.log(dim("Nothing to do. Pass --force to rewrite."));
  }
  return 0;
}
