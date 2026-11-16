import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: false,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
  external: ["yaml"],
});
