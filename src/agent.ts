import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, relativeToRoot } from "./config.js";
import { parseMarkdown } from "./frontmatter.js";
import {
  AGENTS_END,
  AGENTS_START,
  agentsBlock,
  plannerSkillTemplate,
  skillTemplate,
  type TemplateContext,
} from "./templates.js";

export const SKILL_NAME = "couch-potator-board";
export const PLANNER_SKILL_NAME = "couch-potator-planner";

const LEGACY_SKILL_NAME = "board";
const LEGACY_SKILL_TITLE = "Board Viewer";

export interface InstallResult {
  written: string[];
  skipped: string[];
  removed: string[];
}

export function templateContext(root: string): TemplateContext {
  const config = loadConfig(root);
  return {
    command: "couch-potator",
    boardPath: config.board.replace(/\/+$/, ""),
    briefPath: config.brief,
    projectName: path.basename(root),
  };
}

export function skillPath(root: string): string {
  return path.join(root, ".opencode", "skills", SKILL_NAME, "SKILL.md");
}

export function plannerSkillPath(root: string): string {
  return path.join(root, ".opencode", "skills", PLANNER_SKILL_NAME, "SKILL.md");
}

// Earlier versions shipped `.opencode/skills/board/SKILL.md`. Remove it on
// install so a renamed skill never leaves two competing copies behind.
function removeLegacySkill(root: string, removed: string[]): void {
  const dir = path.join(root, ".opencode", "skills", LEGACY_SKILL_NAME);
  const file = path.join(dir, "SKILL.md");
  if (!existsSync(file)) return;

  try {
    if (parseMarkdown(readFileSync(file, "utf8")).data.name !== LEGACY_SKILL_TITLE) return;
  } catch {
    return;
  }

  rmSync(file, { force: true });
  if (!readdirSync(dir).length) rmSync(dir, { recursive: true, force: true });
  removed.push(relativeToRoot(root, file));
}

export function installAgentFiles(root: string, options: { force?: boolean } = {}): InstallResult {
  const context = templateContext(root);
  const written: string[] = [];
  const skipped: string[] = [];
  const removed: string[] = [];

  const skills: Array<[string, string]> = [
    [skillPath(root), skillTemplate(context)],
    [plannerSkillPath(root), plannerSkillTemplate(context)],
  ];

  for (const [file, content] of skills) {
    if (!existsSync(file) || options.force) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content, "utf8");
      written.push(relativeToRoot(root, file));
    } else {
      skipped.push(relativeToRoot(root, file));
    }
  }

  removeLegacySkill(root, removed);

  const agentsPath = path.join(root, "AGENTS.md");
  const block = agentsBlock(context);
  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  const start = existing.indexOf(AGENTS_START);
  const end = existing.indexOf(AGENTS_END);

  let next: string;
  if (start !== -1 && end !== -1 && end > start) {
    next = `${existing.slice(0, start)}${block}${existing.slice(end + AGENTS_END.length)}`;
  } else {
    const prefix = existing.trimEnd();
    next = `${prefix ? `${prefix}\n\n` : ""}${block}\n`;
  }

  if (next !== existing) {
    writeFileSync(agentsPath, next, "utf8");
    written.push(relativeToRoot(root, agentsPath));
  } else {
    skipped.push(relativeToRoot(root, agentsPath));
  }

  return { written, skipped, removed };
}
