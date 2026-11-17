export interface OutputCapture {
  /** Everything written to stdout, stderr, console.log and console.error. */
  logs: string[];
  clear(): void;
  restore(): void;
}

/**
 * Commands print to stdout and warnings go to stderr, so tests buffer both
 * instead of letting them land in the runner output.
 */
export function captureOutput(): OutputCapture {
  const logs: string[] = [];
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  const consoleLog = console.log;
  const consoleError = console.error;

  const record = (chunk: unknown): boolean => {
    logs.push(String(chunk));
    return true;
  };

  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };

  return {
    logs,
    clear() {
      logs.length = 0;
    },
    restore() {
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
      console.log = consoleLog;
      console.error = consoleError;
    },
  };
}
