import { mkdirSync, watch } from "node:fs";
import path from "node:path";
import { cyan, dim, green, red, yellow } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { scanBoard } from "../board.js";
import { boardDir, briefPath, loadConfig, relativeToRoot, resolveRoot } from "../config.js";
import { parseMilestone, plural } from "../log.js";
import { openInBrowser } from "../open.js";
import { buildViewer, writeViewerResult } from "../viewer/build.js";

const OPTIONS = {
  out: { type: "string" as const, short: "o" },
  open: { type: "boolean" as const },
  "no-open": { type: "boolean" as const },
  watch: { type: "boolean" as const, short: "w" },
  milestone: { type: "string" as const, short: "m" },
  root: ROOT_OPTION,
};

const SIZE_WARN = 8 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function viewCommand(argv: string[]): Promise<number> {
  const { values } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const rawMilestone = text(values, "milestone");
  const milestone = rawMilestone === undefined ? undefined : parseMilestone(rawMilestone, null);
  const outOverride = text(values, "out");

  const options = milestone === undefined ? {} : { milestone };
  const build = () => {
    const board = scanBoard(root);
    const result = buildViewer(root, board, options);
    const outPath = outOverride ? path.resolve(root, outOverride) : result.outPath;
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeViewerResult(outPath, result, options);
    return { result, outPath, cards: board.cards.length };
  };

  const first = build();
  const milestones = first.result.payload.projects[0]?.milestones.length ?? 0;

  console.log(`Board viewer: ${cyan(first.outPath)}`);
  console.log(`VIEWER_FILE=${first.outPath}`);
  console.log(
    dim(
      `${plural(first.cards, "card")} across 1 project (${plural(
        milestones,
        "milestone",
      )}) · ${formatBytes(first.result.bytes)}`,
    ),
  );
  if (first.result.bytes > SIZE_WARN) {
    console.log(
      yellow(
        `warning: the generated page is ${formatBytes(first.result.bytes)}, which is large for a single HTML file.`,
      ),
    );
  }
  console.log(dim("Read-only. Regenerate with `couch-potator view`."));

  if (!flag(values, "no-open")) openInBrowser(first.outPath);

  if (!flag(values, "watch")) return 0;

  const config = loadConfig(root);
  const boardFolder = boardDir(root, config);
  const brief = briefPath(root, config);

  let timer: NodeJS.Timeout | null = null;
  const rebuild = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const next = build();
        console.log(
          `${dim(new Date().toLocaleTimeString())} ${green("Rebuilt")} ${plural(
            next.cards,
            "card",
          )} · ${formatBytes(next.result.bytes)}`,
        );
      } catch (error) {
        console.error(`${red("rebuild failed")}: ${(error as Error).message}`);
      }
    }, 200);
  };

  try {
    watch(boardFolder, { recursive: true }, rebuild);
  } catch (error) {
    console.error(
      yellow(
        `could not watch ${relativeToRoot(root, boardFolder)}: ${(error as Error).message}`,
      ),
    );
  }
  try {
    watch(brief, rebuild);
  } catch {
    /* the brief may not exist yet; board changes still rebuild */
  }

  console.log(
    dim(`Watching ${relativeToRoot(root, boardFolder)}/ for changes. Press Ctrl+C to stop.`),
  );
  return 0;
}
