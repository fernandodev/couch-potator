import { dim, green, red, yellow } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { milestonesOf, scanBoard } from "../board.js";
import { resolveRoot } from "../config.js";
import { countIssues } from "../types.js";
import { plural } from "../log.js";
import { validateBoard } from "../validate.js";

const OPTIONS = {
  json: { type: "boolean" as const },
  strict: { type: "boolean" as const },
  root: ROOT_OPTION,
};

export async function checkCommand(argv: string[]): Promise<number> {
  const { values } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root, { lenient: true });
  const issues = validateBoard(board);
  const counts = countIssues(issues);

  if (flag(values, "json")) {
    console.log(
      JSON.stringify(
        {
          ok: counts.errors === 0 && (!flag(values, "strict") || counts.warnings === 0),
          counts,
          cards: board.cards.length,
          milestones: milestonesOf(board),
          issues,
        },
        null,
        2,
      ),
    );
    return counts.errors > 0 || (flag(values, "strict") && counts.warnings > 0) ? 1 : 0;
  }

  for (const issue of issues) {
    const tag = issue.level === "error" ? red("error  ") : yellow("warning");
    const where = issue.file ? dim(issue.file) : dim("board");
    console.log(`${tag} ${where}: ${issue.message}`);
  }

  const milestones = milestonesOf(board);
  const summary = `${plural(board.cards.length, "card")} · ${plural(
    milestones.length,
    "milestone",
  )} · ${plural(counts.errors, "error")} · ${plural(counts.warnings, "warning")}`;

  if (!issues.length) {
    console.log(`${green("Board is clean")} · ${summary}`);
  } else {
    console.log("");
    console.log(dim(summary));
  }

  if (counts.errors > 0) return 1;
  if (flag(values, "strict") && counts.warnings > 0) return 1;
  return 0;
}
