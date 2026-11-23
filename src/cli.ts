import { red } from "./ansi.js";
import { EXIT_USAGE } from "./errors.js";
import { run } from "./run.js";

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // `run` handles expected failures; this only catches a bug in the harness.
    console.error(`${red("couch-potator:")} ${(error as Error).message ?? String(error)}`);
    process.exitCode = EXIT_USAGE;
  });
