import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Board } from "../board.js";
import { viewerOutPath } from "../config.js";
import { CliError } from "../errors.js";
import { writeFileAtomic } from "../fsutil.js";
import { buildPayload, type PayloadOptions, type ViewerPayload } from "./data.js";

const require = createRequire(import.meta.url);

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function assetsDir(): string {
  const here = moduleDir();
  const candidates = [
    path.join(here, "assets"),
    path.join(here, "viewer", "assets"),
    path.join(here, "..", "src", "viewer", "assets"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  throw new CliError("Viewer assets are missing from this install.", {
    hint: "Reinstall couch-potator.",
  });
}

function readAsset(name: string): string {
  return readFileSync(path.join(assetsDir(), name), "utf8");
}

function readVendor(moduleName: string, packageFile: string, localFile: string): string {
  const local = path.join(assetsDir(), "vendor", localFile);
  if (existsSync(local)) return readFileSync(local, "utf8");

  try {
    const main = require.resolve(moduleName);
    const packageRoot = path.dirname(path.dirname(main));
    const candidate = path.join(packageRoot, packageFile);
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  } catch {
    /* fall through to the error below */
  }

  throw new CliError(`Viewer dependency "${moduleName}" is missing.`, {
    hint: "Reinstall couch-potator, or run `npm install` in the couch-potator checkout.",
  });
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

/** Prevents an inlined script from closing the surrounding <script> tag. */
const inlineSafe = (code: string): string => code.replace(/<\/script/gi, "<\\/script");

const fill = (template: string, slot: string, value: string): string =>
  template.split(slot).join(value);

export interface ViewerResult {
  outPath: string;
  html: string;
  payload: ViewerPayload;
  bytes: number;
  cards: number;
}

export function buildViewer(
  root: string,
  board: Board,
  options: PayloadOptions = {},
): ViewerResult {
  const payload = buildPayload(root, board, options);
  const template = readAsset("index.html");
  const css = readAsset("style.css");
  const app = readAsset("app.js");
  const marked = readVendor("marked", "lib/marked.umd.js", "marked.umd.js");
  const purify = readVendor("dompurify", "dist/purify.min.js", "purify.min.js");

  const projectName = payload.projects[0]?.name ?? "Board";
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");

  let html = template;
  html = fill(html, "<!--COUCH_POTATOR_TITLE-->", escapeHtml(`Board · ${projectName}`));
  html = fill(html, "<!--COUCH_POTATOR_STYLE-->", `<style>\n${css}\n</style>`);
  html = fill(
    html,
    "<!--COUCH_POTATOR_DATA-->",
    `<script id="board-data" type="application/json">${json}</script>`,
  );
  html = fill(
    html,
    "<!--COUCH_POTATOR_VENDOR-->",
    `<script>${inlineSafe(marked)}</script>\n<script>${inlineSafe(purify)}</script>`,
  );
  html = fill(html, "<!--COUCH_POTATOR_APP-->", `<script>${inlineSafe(app)}</script>`);

  return {
    outPath: viewerOutPath(root, board.config),
    html,
    payload,
    bytes: Buffer.byteLength(html, "utf8"),
    cards: board.cards.length,
  };
}

interface ViewerOptionsFile {
  milestone?: number | null;
}

/** Remembers the flags a viewer was generated with, so a later refresh keeps them. */
function optionsPath(outPath: string): string {
  return `${outPath}.options.json`;
}

export function saveViewerOptions(outPath: string, options: PayloadOptions): void {
  const file = optionsPath(outPath);
  if (options.milestone === undefined) {
    rmSync(file, { force: true });
    return;
  }
  writeFileAtomic(file, `${JSON.stringify({ milestone: options.milestone })}\n`);
}

export function loadViewerOptions(outPath: string): PayloadOptions {
  const file = optionsPath(outPath);
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as ViewerOptionsFile;
    if (parsed.milestone === null) return { milestone: null };
    if (typeof parsed.milestone === "number") return { milestone: parsed.milestone };
  } catch {
    /* a corrupt options file falls back to the brief's current milestone */
  }
  return {};
}

export function writeViewerResult(
  outPath: string,
  result: ViewerResult,
  options: PayloadOptions,
): void {
  writeFileAtomic(outPath, result.html);
  saveViewerOptions(outPath, options);
}

export function writeViewer(
  root: string,
  board: Board,
  options: PayloadOptions = {},
): ViewerResult {
  const result = buildViewer(root, board, options);
  mkdirSync(path.dirname(result.outPath), { recursive: true });
  writeViewerResult(result.outPath, result, options);
  return result;
}
