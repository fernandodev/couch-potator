import { spawn } from "node:child_process";

export function openInBrowser(file: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", file] : [file];

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {
      /* headless machines simply don't get a tab */
    });
    child.unref();
  } catch {
    /* best effort */
  }
}
