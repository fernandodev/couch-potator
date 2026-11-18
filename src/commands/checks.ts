import { bold, cyan, dim, green, yellow } from "../ansi.js";
import { flag, parseCommandArgs, text, ROOT_OPTION } from "../args.js";
import {
  CHECK_PHASES,
  loadConfig,
  resolveRoot,
  saveConfig,
  type CheckPhase,
  type Checks,
} from "../config.js";
import { UsageError } from "../errors.js";

const OPTIONS = {
  json: { type: "boolean" as const },
  root: ROOT_OPTION,
};

const CHECK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function resolvePhase(value: string | undefined): CheckPhase {
  const key = String(value ?? "").trim().toLowerCase();
  if ((CHECK_PHASES as readonly string[]).includes(key)) return key as CheckPhase;
  throw new UsageError(`Unknown check phase "${value ?? ""}".`, {
    details: [`Phases: ${CHECK_PHASES.join(", ")}`],
  });
}

function resolveName(value: string | undefined): string {
  const name = String(value ?? "").trim();
  if (!name) {
    throw new UsageError("A check needs a name.", {
      hint: "couch-potator checks set fast test \"npm test\"",
    });
  }
  if (!CHECK_NAME.test(name)) {
    throw new UsageError(`Invalid check name "${name}".`, {
      details: ["Use letters, digits, dots, dashes and underscores; start with a letter or digit."],
    });
  }
  return name;
}

function printChecks(checks: Checks): void {
  for (const phase of CHECK_PHASES) {
    console.log(bold(`${phase === "fast" ? "Fast" : "Full"} checks`));
    const entries = Object.entries(checks[phase]);
    if (!entries.length) {
      console.log(dim("  none"));
    } else {
      for (const [name, command] of entries) {
        console.log(`  ${cyan(name.padEnd(12))} ${command}`);
      }
    }
    if (phase !== CHECK_PHASES[CHECK_PHASES.length - 1]) console.log("");
  }
  console.log("");
  console.log(
    dim(
      "Fast checks run on every card and after every rebase; full checks run once when the milestone is built.",
    ),
  );
}

export async function checksCommand(argv: string[]): Promise<number> {
  const { values, positionals } = parseCommandArgs(argv, OPTIONS);
  const root = resolveRoot(text(values, "root"));
  const config = loadConfig(root);
  const action = positionals[0];

  if (!action) {
    if (flag(values, "json")) {
      console.log(JSON.stringify(config.checks, null, 2));
    } else {
      printChecks(config.checks);
    }
    return 0;
  }

  if (action === "set") {
    const phase = resolvePhase(positionals[1]);
    const name = resolveName(positionals[2]);
    const command = positionals.slice(3).join(" ").trim();
    if (!command) {
      throw new UsageError(`No command given for ${phase}.${name}.`, {
        hint: `couch-potator checks set ${phase} ${name} "<command>"`,
      });
    }

    const previous = config.checks[phase][name];
    config.checks[phase][name] = command;
    saveConfig(root, config);

    console.log(
      `${previous ? yellow("updated") : green("set")} ${cyan(`${phase}.${name}`)} ${dim("=")} ${command}`,
    );
    return 0;
  }

  if (action === "clear") {
    const phase = resolvePhase(positionals[1]);
    const name = positionals[2] ? resolveName(positionals[2]) : null;

    if (name) {
      const existed = Boolean(config.checks[phase][name]);
      delete config.checks[phase][name];
      saveConfig(root, config);
      console.log(
        existed
          ? `${yellow("cleared")} ${cyan(`${phase}.${name}`)}`
          : dim(`No ${phase}.${name} check configured.`),
      );
      return 0;
    }

    config.checks[phase] = {};
    saveConfig(root, config);
    console.log(`${yellow("cleared")} ${cyan(`${phase} checks`)}`);
    return 0;
  }

  throw new UsageError(`Unknown checks action "${action}".`, {
    details: [
      "couch-potator checks [--json]",
      "couch-potator checks set <fast|full> <name> \"<command>\"",
      "couch-potator checks clear <fast|full> [name]",
    ],
  });
}
