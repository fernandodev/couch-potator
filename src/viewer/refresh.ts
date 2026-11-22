import { existsSync } from "node:fs";
import { scanBoard } from "../board.js";
import { loadConfig, viewerOutPath } from "../config.js";
import { buildViewer, loadViewerOptions, writeViewerResult, type ViewerResult } from "./build.js";

/**
 * Rewrites the default viewer after a board change, but only when `view` has
 * already generated one. This keeps the page's Reload button useful without
 * turning every board change into a new viewer for someone who never asked for
 * one. Failures stay silent: a viewer problem must not fail a board change.
 */
export function refreshViewer(root: string): ViewerResult | null {
  try {
    const config = loadConfig(root);
    const outPath = viewerOutPath(root, config);
    if (!existsSync(outPath)) return null;
    const options = loadViewerOptions(outPath);
    const result = buildViewer(root, scanBoard(root), options);
    writeViewerResult(outPath, result, options);
    return result;
  } catch {
    return null;
  }
}
