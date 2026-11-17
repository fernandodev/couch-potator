import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { installAgentFiles } from "../agent.js";
import { cyan, dim, green, yellow } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import { COLUMNS } from "../columns.js";
import {
  CONFIG_DIR,
  DEFAULT_CONFIG,
  boardDir,
  briefPath,
  configPath,
  loadConfig,
  relativeToRoot,
  saveConfig,
  viewerOutPath,
} from "../config.js";
import { ensureLine, writeIfMissing } from "../fsutil.js";
import { CARD_TEMPLATE, projectTemplate } from "../templates.js";

const OPTIONS = {
  name: { type: "string" as const },
  "no-skill": { type: "boolean" as const },
  force: { type: "boolean" as const },
  root: ROOT_OPTION,
};

export async function initCommand(argv: string[]): Promise<number> {
  const { values } = parseCommandArgs(argv, OPTIONS);
  const root = path.resolve(text(values, "root") ?? process.cwd());
  mkdirSync(root, { recursive: true });

  const created: string[] = [];
  const existing: string[] = [];
  const removed: string[] = [];

  const config = existsSync(configPath(root)) ? loadConfig(root) : DEFAULT_CONFIG;
  for (const column of COLUMNS) {
    const dir = path.join(boardDir(root, config), column);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(relativeToRoot(root, dir) + "/");
    } else {
      existing.push(relativeToRoot(root, dir) + "/");
    }
  }

  mkdirSync(path.join(root, CONFIG_DIR, "templates"), { recursive: true });
  if (!existsSync(configPath(root))) {
    saveConfig(root, DEFAULT_CONFIG);
    created.push(relativeToRoot(root, configPath(root)));
  } else {
    existing.push(relativeToRoot(root, configPath(root)));
  }

  const templateFile = path.join(root, CONFIG_DIR, "templates", "card.md");
  (writeIfMissing(templateFile, CARD_TEMPLATE) ? created : existing).push(
    relativeToRoot(root, templateFile),
  );

  const brief = briefPath(root, config);
  const projectName = text(values, "name") ?? path.basename(root);
  (writeIfMissing(brief, projectTemplate(projectName)) ? created : existing).push(
    relativeToRoot(root, brief),
  );

  mkdirSync(path.dirname(viewerOutPath(root, config)), { recursive: true });
  (ensureLine(path.join(root, ".gitignore"), `${CONFIG_DIR}/viewer/`) ? created : existing).push(
    ".gitignore",
  );

  if (!flag(values, "no-skill")) {
    const result = installAgentFiles(root, { force: flag(values, "force") });
    created.push(...result.written);
    existing.push(...result.skipped);
    removed.push(...result.removed);
  }

  console.log(`${green("Initialised")} board in ${cyan(root)}`);
  for (const item of created) console.log(`  ${green("+")} ${item}`);
  for (const item of existing) console.log(`  ${dim("=")} ${dim(item)}`);
  for (const item of removed) console.log(`  ${yellow("-")} ${item}`);
  console.log("");
  console.log(`Next: ${cyan('couch-potator add "First card"')}`);
  return 0;
}
