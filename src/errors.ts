export const EXIT_OK = 0;
export const EXIT_INVALID = 1;
export const EXIT_USAGE = 2;

export interface CliErrorExtra {
  hint?: string;
  details?: string[];
}

export class CliError extends Error {
  readonly exitCode: number;
  readonly hint?: string;
  readonly details?: string[];

  constructor(
    message: string,
    exitCodeOrExtra: number | CliErrorExtra = EXIT_INVALID,
    extra: CliErrorExtra = {},
  ) {
    super(message);
    this.name = "CliError";

    const options = typeof exitCodeOrExtra === "number" ? extra : exitCodeOrExtra;
    this.exitCode = typeof exitCodeOrExtra === "number" ? exitCodeOrExtra : EXIT_INVALID;

    if (options.hint) this.hint = options.hint;
    if (options.details) this.details = options.details;
  }
}

export class UsageError extends CliError {
  constructor(message: string, extra: CliErrorExtra = {}) {
    super(message, EXIT_USAGE, extra);
    this.name = "UsageError";
  }
}
