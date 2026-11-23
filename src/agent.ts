import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, relativeToRoot } from "./config.js";
import { UsageError } from "./errors.js";
import { parseMarkdown } from "./frontmatter.js";
import {
  AGENTS_END,
  AGENTS_START,
  agentsBlock,
  implementCommandTemplate,
  implementerAgentTemplate,
  implementSkillTemplate,
  integratorAgentTemplate,
  plannerSkillTemplate,
  skillTemplate,
  unblockCommandTemplate,
  unblockSkillTemplate,
  type AgentTarget,
  type TemplateContext,
} from "./templates.js";

export { type AgentTarget };

export const SKILL_NAME = "couch-potator-board";
export const PLANNER_SKILL_NAME = "couch-potator-planner";
export const UNBLOCK_SKILL_NAME = "couch-potator-unblock";
export const IMPLEMENT_SKILL_NAME = "couch-potator-implement";
export const UNBLOCK_COMMAND_NAME = "unblock";
export const IMPLEMENT_COMMAND_NAME = "implement";
export const IMPLEMENTER_AGENT_NAME = "couch-potator-implementer";
export const INTEGRATOR_AGENT_NAME = "couch-potator-integrator";

export const INSTALL_TARGETS = ["opencode", "claude", "both"] as const;
export type InstallTarget = (typeof INSTALL_TARGETS)[number];

const LEGACY_SKILL_NAME = "board";
const LEGACY_SKILL_TITLE = "Board Viewer";

export interface InstallResult {
  /** Files created for the first time. */
  written: string[];
  /** Existing files replaced because they differed from the template. */
  updated: string[];
  skipped: string[];
  removed: string[];
}

export interface InstallOptions {
  force?: boolean;
  target?: InstallTarget;
  /**
   * Refresh managed files that changed since they were installed. Unlike
   * `force`, files whose content already matches are left untouched.
   */
  update?: boolean;
}

/** Accepts the names people actually type for the two agent runtimes. */
export function parseInstallTarget(value: string | undefined): InstallTarget {
  if (value === undefined || value.trim() === "") return "opencode";

  const key = value.trim().toLowerCase();
  const target =
    key === "claude-code" || key === "claudecode" || key === "claude_code" ? "claude" : key;
  if ((INSTALL_TARGETS as readonly string[]).includes(target)) {
    return target as InstallTarget;
  }

  throw new UsageError(`Unknown target "${value}".`, {
    details: [`Use one of: ${INSTALL_TARGETS.join(", ")}.`],
  });
}

function baseDir(target: AgentTarget): string {
  return target === "claude" ? ".claude" : ".opencode";
}

function instructionsPath(root: string, target: AgentTarget): string {
  return path.join(root, target === "claude" ? "CLAUDE.md" : "AGENTS.md");
}

export function templateContext(root: string, target: AgentTarget = "opencode"): TemplateContext {
  const config = loadConfig(root);
  return {
    command: "couch-potator",
    boardPath: config.board.replace(/\/+$/, ""),
    briefPath: config.brief,
    projectName: path.basename(root),
    target,
    instructionsFile: target === "claude" ? "CLAUDE.md" : "AGENTS.md",
    questionTool: target === "claude" ? "AskUserQuestion" : "question",
    multiSelectField: target === "claude" ? "multiSelect" : "multiple",
  };
}

export function skillPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "skills", SKILL_NAME, "SKILL.md");
}

export function plannerSkillPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "skills", PLANNER_SKILL_NAME, "SKILL.md");
}

export function unblockSkillPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "skills", UNBLOCK_SKILL_NAME, "SKILL.md");
}

export function unblockCommandPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "commands", `${UNBLOCK_COMMAND_NAME}.md`);
}

export function implementSkillPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "skills", IMPLEMENT_SKILL_NAME, "SKILL.md");
}

export function implementCommandPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "commands", `${IMPLEMENT_COMMAND_NAME}.md`);
}

export function implementerAgentPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "agents", `${IMPLEMENTER_AGENT_NAME}.md`);
}

export function integratorAgentPath(root: string, target: AgentTarget = "opencode"): string {
  return path.join(root, baseDir(target), "agents", `${INTEGRATOR_AGENT_NAME}.md`);
}

/**
 * The runtimes a project already has couch-potator skills for. Update uses it
 * to refresh whichever target was installed instead of guessing OpenCode.
 */
export function detectInstalledTargets(root: string): AgentTarget[] {
  return (["opencode", "claude"] as const).filter((target) =>
    [skillPath, plannerSkillPath, unblockSkillPath, implementSkillPath].some((agentPath) =>
      existsSync(agentPath(root, target)),
    ),
  );
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

function writeManagedBlock(root: string, file: string, block: string, result: InstallResult): void {
  const existed = existsSync(file);
  const existing = existed ? readFileSync(file, "utf8") : "";
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
    writeFileSync(file, next, "utf8");
    (existed ? result.updated : result.written).push(relativeToRoot(root, file));
  } else {
    result.skipped.push(relativeToRoot(root, file));
  }
}

function installTarget(
  root: string,
  target: AgentTarget,
  options: InstallOptions,
  result: InstallResult,
): void {
  const context = templateContext(root, target);
  const agentFiles: Array<[string, string]> = [
    [skillPath(root, target), skillTemplate(context)],
    [plannerSkillPath(root, target), plannerSkillTemplate(context)],
    [unblockSkillPath(root, target), unblockSkillTemplate(context)],
    [unblockCommandPath(root, target), unblockCommandTemplate(context)],
    [implementSkillPath(root, target), implementSkillTemplate(context)],
    [implementCommandPath(root, target), implementCommandTemplate(context)],
    [implementerAgentPath(root, target), implementerAgentTemplate(context)],
    [integratorAgentPath(root, target), integratorAgentTemplate(context)],
  ];

  for (const [file, content] of agentFiles) {
    const existed = existsSync(file);
    const changed = existed && readFileSync(file, "utf8") !== content;
    if (!existed || options.force || (options.update && changed)) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content, "utf8");
      (existed ? result.updated : result.written).push(relativeToRoot(root, file));
    } else {
      result.skipped.push(relativeToRoot(root, file));
    }
  }

  if (target === "opencode") removeLegacySkill(root, result.removed);
  writeManagedBlock(root, instructionsPath(root, target), agentsBlock(context), result);
}

export function installAgentFiles(root: string, options: InstallOptions = {}): InstallResult {
  const result: InstallResult = { written: [], updated: [], skipped: [], removed: [] };
  const target = options.target ?? "opencode";
  const targets: AgentTarget[] = target === "both" ? ["opencode", "claude"] : [target];

  for (const agentTarget of targets) {
    installTarget(root, agentTarget, options, result);
  }

  return result;
}
