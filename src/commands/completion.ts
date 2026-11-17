import { parseArgs } from "node:util";
import { cyan, dim, green } from "../ansi.js";
import { flag, parseCommandArgs, ROOT_OPTION } from "../args.js";
import {
  completionCandidates,
  completionScript,
  detectShell,
  installCompletion,
  parseShell,
  SHELLS,
  type Shell,
} from "../completion.js";
import { UsageError } from "../errors.js";

const OPTIONS = {
  print: { type: "boolean" as const },
  "no-rc": { type: "boolean" as const },
  root: ROOT_OPTION,
};

const SHELL_LIST = SHELLS.join("|");

function resolveShell(raw: string | undefined): Shell {
  if (raw) {
    const shell = parseShell(raw);
    if (!shell) {
      throw new UsageError(`Unknown shell "${raw}".`, {
        hint: `Supported shells: ${SHELL_LIST} (sh is treated as bash).`,
      });
    }
    return shell;
  }

  const detected = detectShell();
  if (!detected) {
    throw new UsageError("Could not detect a supported shell from $SHELL.", {
      hint: `Pass one explicitly: couch-potator completion install ${SHELL_LIST}`,
    });
  }
  return detected;
}

export async function completionCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);

  const [actionOrShell, maybeShell, ...extra] = positionals;
  if (extra.length) {
    throw new UsageError("Too many arguments.", {
      details: ["couch-potator completion [install] [bash|zsh|fish] [--print] [--no-rc]"],
    });
  }

  const install = actionOrShell === "install";
  if (!install && maybeShell) {
    throw new UsageError(`Unexpected argument "${maybeShell}".`, {
      details: ["couch-potator completion [install] [bash|zsh|fish] [--print] [--no-rc]"],
    });
  }

  const shell = resolveShell(install ? maybeShell : actionOrShell);

  if (!install || flag(values, "print")) {
    process.stdout.write(completionScript(shell));
    return 0;
  }

  const skipRc = flag(values, "no-rc");
  const result = installCompletion({ shell, skipRc });

  console.log(`${green("wrote")} ${cyan(result.scriptPath)}`);

  if (shell === "fish") {
    console.log(dim("Fish loads this file automatically."));
  } else if (result.rcPath && skipRc) {
    console.log(dim(`Add this to ${result.rcPath}:`));
    if (result.rcSnippet) console.log(result.rcSnippet.trimEnd());
  } else if (result.rcPath) {
    if (result.rcUpdated) {
      console.log(`${green("wired")} ${cyan(result.rcPath)}`);
    } else {
      console.log(`${dim("kept")} ${dim(result.rcPath)} ${dim("(already wired)")}`);
    }
  }

  console.log(dim("Restart your shell or open a new tab to use it."));
  return 0;
}

/**
 * Hidden protocol used by the generated shell scripts. It prints one candidate
 * per line and must never fail the shell, so every error is swallowed.
 */
export async function completeCommand(argv: string[]): Promise<number> {
  let current = "";
  let previous: string[] = [];

  try {
    const parsed = parseArgs({
      args: argv,
      options: { current: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    if (typeof parsed.values.current === "string") current = parsed.values.current;
    previous = parsed.positionals;
  } catch {
    return 0;
  }

  let candidates: string[] = [];
  try {
    candidates = completionCandidates({ current, previous });
  } catch {
    candidates = [];
  }

  if (candidates.length) process.stdout.write(`${candidates.join("\n")}\n`);
  return 0;
}
