import simpleGit from "simple-git";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

export async function cloneRepo(repoUrl: string, token: string): Promise<string> {
  const workDir = path.join(os.tmpdir(), `lacia-${crypto.randomBytes(8).toString("hex")}`);
  await fs.mkdir(workDir, { recursive: true });

  let authUrl = repoUrl;
  if (token && repoUrl.startsWith("https://github.com")) {
    authUrl = repoUrl.replace("https://github.com", `https://${token}@github.com`);
  }

  const git = simpleGit();
  await git.clone(authUrl, workDir, ["--depth", "1"]);

  return workDir;
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
