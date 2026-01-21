import simpleGit from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

export type CloneErrorCode = "auth_required" | "not_found" | "network" | "unknown";

export class CloneError extends Error {
  constructor(
    public code: CloneErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CloneError";
  }
}

function classifyGitError(error: unknown): CloneError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("authentication") || lower.includes("401") || lower.includes("403")) {
    return new CloneError("auth_required", "Repository requires authentication. Set GITHUB_TOKEN for private repos.");
  }
  if (lower.includes("not found") || lower.includes("404") || lower.includes("does not exist")) {
    return new CloneError("not_found", "Repository not found. Check the URL is correct.");
  }
  if (lower.includes("could not resolve") || lower.includes("unable to access") || lower.includes("network")) {
    return new CloneError("network", "Network error. Check your connection and try again.");
  }
  return new CloneError("unknown", message);
}

export async function cloneRepo(repoUrl: string, token: string): Promise<string> {
  const workDir = path.join(os.tmpdir(), `lacia-${crypto.randomBytes(8).toString("hex")}`);
  await fs.mkdir(workDir, { recursive: true });

  let authUrl = repoUrl;
  if (token && repoUrl.startsWith("https://github.com")) {
    authUrl = repoUrl.replace("https://github.com", `https://${token}@github.com`);
  }

  try {
    const git = simpleGit();
    await git.clone(authUrl, workDir, ["--depth", "1"]);
    return workDir;
  } catch (error) {
    // Cleanup failed clone directory
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw classifyGitError(error);
  }
}

export async function buildFileTree(dir: string, prefix = ""): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const lines: string[] = [];

  const filtered = entries.filter(
    (e) => !["node_modules", ".git", "__pycache__", ".next", "dist", "build"].includes(e.name)
  );

  for (const entry of filtered) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      lines.push(`${relativePath}/`);
      const subtree = await buildFileTree(path.join(dir, entry.name), relativePath);
      lines.push(subtree);
    } else {
      lines.push(relativePath);
    }
  }

  return lines.join("\n");
}

export async function cleanup(workDir: string): Promise<void> {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
