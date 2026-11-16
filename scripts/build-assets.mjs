import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "src", "viewer", "assets");
const target = path.join(root, "dist", "assets");

cpSync(source, target, { recursive: true });

const vendor = [
  ["marked", "lib/marked.umd.js", "marked.umd.js"],
  ["dompurify", "dist/purify.min.js", "purify.min.js"],
];

mkdirSync(path.join(target, "vendor"), { recursive: true });

for (const [pkg, from, to] of vendor) {
  const file = path.join(root, "node_modules", pkg, from);
  if (!existsSync(file)) {
    console.error(`missing vendor file: ${file}`);
    process.exitCode = 1;
    continue;
  }
  cpSync(file, path.join(target, "vendor", to));
}

console.log(`viewer assets -> ${path.relative(root, target)}`);
