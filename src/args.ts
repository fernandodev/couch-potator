import { parseArgs } from "node:util";
import { UsageError } from "./errors.js";

export type OptionType = "string" | "boolean";

export interface OptionSpec {
  type: OptionType;
  short?: string;
  multiple?: boolean;
}

export type OptionSpecs = Record<string, OptionSpec>;

export interface ParsedCommand {
  values: Record<string, string | boolean | string[] | boolean[] | undefined>;
  positionals: string[];
}

export function parseCommandArgs(args: string[], options: OptionSpecs): ParsedCommand {
  try {
    const parsed = parseArgs({
      args,
      options,
      allowPositionals: true,
      strict: true,
    });
    return {
      values: parsed.values as ParsedCommand["values"],
      positionals: parsed.positionals,
    };
  } catch (error) {
    throw new UsageError((error as Error).message.replace(/^TypeError:\s*/, ""));
  }
}

export function flag(
  values: ParsedCommand["values"],
  name: string,
): boolean {
  const value = values[name];
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0 && value.every(Boolean);
  return false;
}

export function text(
  values: ParsedCommand["values"],
  name: string,
): string | undefined {
  const value = values[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return typeof last === "string" ? last : undefined;
  }
  return undefined;
}

export function list(values: ParsedCommand["values"], name: string): string[] {
  const value = values[name];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export const ROOT_OPTION: OptionSpec = { type: "string" };
