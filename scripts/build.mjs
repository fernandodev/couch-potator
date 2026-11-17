import { chmodSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outfile = path.join(root, "dist", "cli.js");

rmSync(path.join(root, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, "src", "cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: false,
  sourcemap: false,
  // yaml stays a real dependency; bundling it breaks its dynamic require of
  // node built-ins inside the ESM output.
  external: ["yaml"],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

chmodSync(outfile, 0o755);
