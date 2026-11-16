export type IssueLevel = "error" | "warning";

export interface Issue {
  level: IssueLevel;
  message: string;
  file?: string;
}

export interface Counts {
  errors: number;
  warnings: number;
}

export function countIssues(issues: Issue[]): Counts {
  return {
    errors: issues.filter((issue) => issue.level === "error").length,
    warnings: issues.filter((issue) => issue.level === "warning").length,
  };
}
