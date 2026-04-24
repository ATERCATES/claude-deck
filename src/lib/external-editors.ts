import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ExternalEditorAvailability {
  vscode: boolean;
  cursor: boolean;
  finder: boolean;
}

let cached: ExternalEditorAvailability | null = null;

async function hasBinary(name: string): Promise<boolean> {
  try {
    await execFileAsync("which", [name], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function detectExternalEditors(): Promise<ExternalEditorAvailability> {
  if (cached) return cached;
  const [vscode, cursor] = await Promise.all([
    hasBinary("code"),
    hasBinary("cursor"),
  ]);
  cached = { vscode, cursor, finder: true };
  return cached;
}

export function getNativeOpenCommand(): "open" | "xdg-open" {
  return process.platform === "darwin" ? "open" : "xdg-open";
}
