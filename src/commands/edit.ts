import { spawnSync } from "node:child_process";
import { parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { resolveCard, scanBoard } from "../board.js";
import { resolveRoot } from "../config.js";
import { CliError, UsageError } from "../errors.js";
import { refreshViewer } from "../viewer/refresh.js";

const OPTIONS = {
  root: ROOT_OPTION,
};

export async function editCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const board = scanBoard(root);
  const reference = positionals[0];
  if (!reference) throw new UsageError("edit needs a card.");

  const card = resolveCard(board, reference);
  const editor =
    process.env.VISUAL ||
    process.env.EDITOR ||
    (process.platform === "win32" ? "notepad" : "vi");

  const [command, ...editorArgs] = editor.split(/\s+/).filter(Boolean);
  if (!command) throw new CliError("$EDITOR is empty.");

  const result = spawnSync(command, [...editorArgs, card.file], { stdio: "inherit" });
  if (result.error) {
    throw new CliError(`Could not launch "${editor}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CliError(`"${editor}" exited with status ${result.status ?? "unknown"}.`);
  }
  refreshViewer(root);
  return 0;
}
