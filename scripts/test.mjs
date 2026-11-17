import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Tests are TypeScript, so bundle them with esbuild and let Node's built-in
// test runner execute the result. This keeps the toolchain to one dev
// dependency (esbuild) instead of a full test framework and its glob stack.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testsDir = path.join(root, "tests");
const outdir = path.join(root, ".test-build");

rmSync(outdir, { recursive: true, force: true });

const entryPoints = readdirSync(testsDir)
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => path.join(testsDir, file));

if (!entryPoints.length) {
  console.error("No test files found in tests/.");
  process.exit(1);
}

await build({
  entryPoints,
  outdir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: "inline",
  // Same reason as the CLI bundle: yaml's CJS wrapper breaks when inlined.
  external: ["yaml"],
  logLevel: "warning",
});

const files = readdirSync(outdir)
  .filter((file) => file.endsWith(".test.js"))
  .sort()
  .map((file) => path.join(outdir, file));

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
});

rmSync(outdir, { recursive: true, force: true });
process.exit(result.status ?? 1);
