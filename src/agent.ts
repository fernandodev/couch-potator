import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, relativeToRoot } from "./config.js";
import {
  AGENTS_END,
  AGENTS_START,
  agentsBlock,
  skillTemplate,
  type TemplateContext,
} from "./templates.js";

export interface InstallResult {
  written: string[];
  skipped: string[];
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

export function installAgentFiles(root: string, options: { force?: boolean } = {}): InstallResult {
  const context = templateContext(root);
  const written: string[] = [];
  const skipped: string[] = [];

  const skillPath = path.join(root, ".opencode", "skills", "board", "SKILL.md");
  if (!existsSync(skillPath) || options.force) {
    mkdirSync(path.dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, skillTemplate(context), "utf8");
    written.push(relativeToRoot(root, skillPath));
  } else {
    skipped.push(relativeToRoot(root, skillPath));
  }

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

  return { written, skipped };
}
