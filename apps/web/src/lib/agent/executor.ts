import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { parseRepoUrl, createPullRequest, getDefaultBranch, RepoInfo } from "../git-provider";

const execAsync = promisify(exec);

export interface ToolContext {
  workDir: string;
  repoUrl: string;
  repoInfo: RepoInfo;
  branch: string;
  defaultBranch?: string; // Cached default branch from the repo
  git: SimpleGit;
}

export async function executeReadFile(
  ctx: ToolContext,
  args: { path: string }
): Promise<string> {
  const filePath = path.join(ctx.workDir, args.path);
  const content = await fs.readFile(filePath, "utf-8");
  return content;
}

export async function executeWriteFile(
  ctx: ToolContext,
  args: { path: string; content: string }
): Promise<string> {
  const filePath = path.join(ctx.workDir, args.path);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, args.content, "utf-8");
  return `File written: ${args.path}`;
}

export async function executeEditFile(
  ctx: ToolContext,
  args: { path: string; search: string; replace: string }
): Promise<string> {
  const filePath = path.join(ctx.workDir, args.path);
  const content = await fs.readFile(filePath, "utf-8");
  if (!content.includes(args.search)) {
    throw new Error(`Search text not found in ${args.path}`);
  }
  const updated = content.replace(args.search, args.replace);
  await fs.writeFile(filePath, updated, "utf-8");
  return `File edited: ${args.path}`;
}

export async function executeListDirectory(
  ctx: ToolContext,
  args: { path: string }
): Promise<string> {
  const dirPath = path.join(ctx.workDir, args.path);
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const lines = entries.map((e) => {
    const prefix = e.isDirectory() ? "[DIR]  " : "[FILE] ";
    return prefix + e.name;
  });
  return lines.join("\n");
}

export async function executeSearchFiles(
  ctx: ToolContext,
  args: { pattern: string; glob?: string }
): Promise<string> {
  const globArg = args.glob ? `--include="${args.glob}"` : "";
  const { stdout } = await execAsync(
    `grep -rn ${globArg} "${args.pattern}" . --exclude-dir=node_modules --exclude-dir=.git`,
    { cwd: ctx.workDir, maxBuffer: 1024 * 1024 }
  ).catch(() => ({ stdout: "No matches found" }));
  return stdout.slice(0, 5000);
}

export async function executeRunCommand(
  ctx: ToolContext,
  args: { command: string }
): Promise<string> {
  const { stdout, stderr } = await execAsync(args.command, {
    cwd: ctx.workDir,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  return stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
}

export async function executeCreateBranch(
  ctx: ToolContext,
  args: { name: string }
): Promise<string> {
  await ctx.git.checkoutLocalBranch(args.name);
  ctx.branch = args.name;
  return `Created and checked out branch: ${args.name}`;
}

export async function executeCommitChanges(
  ctx: ToolContext,
  args: { message: string }
): Promise<string> {
  await ctx.git.add(".");
  await ctx.git.commit(args.message);
  return `Committed: ${args.message}`;
}

export class PrSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrSkippedError";
  }
}

export async function executeCreatePR(
  ctx: ToolContext,
  args: { title: string; body: string }
): Promise<string> {
  const token = process.env.GIT_TOKEN;
  
  console.log(`[PR] Starting PR creation for branch: ${ctx.branch}`);
  console.log(`[PR] Repo: ${ctx.repoInfo.owner}/${ctx.repoInfo.repo} (${ctx.repoInfo.provider})`);
  console.log(`[PR] Token present: ${token ? "yes (length: " + token.length + ")" : "NO"}`);
  
  // Check for token - if missing, skip PR creation (dry-run mode)
  if (!token) {
    throw new PrSkippedError(
      `[DRY-RUN] No GIT_TOKEN set. Fix was applied locally but PR not created. ` +
      `Title: "${args.title}" | Files modified can be seen in previous tool calls.`
    );
  }

  // Get the default branch (use cached value if available)
  let targetBranch = ctx.defaultBranch;
  if (!targetBranch) {
    targetBranch = await getDefaultBranch(ctx.repoInfo, token);
    ctx.defaultBranch = targetBranch; // Cache it
  }
  console.log(`[PR] Target branch: ${targetBranch}`);

  try {
    console.log(`[PR] Pushing branch ${ctx.branch} to origin...`);
    await ctx.git.push("origin", ctx.branch, ["--set-upstream"]);
    console.log(`[PR] Push successful`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[PR] Push failed: ${message}`);
    throw new Error(`Failed to push branch: ${message}`);
  }

  try {
    console.log(`[PR] Creating pull request: ${ctx.branch} -> ${targetBranch}...`);
    const result = await createPullRequest(ctx.repoInfo, token, {
      title: args.title,
      body: args.body,
      sourceBranch: ctx.branch,
      targetBranch: targetBranch,
    });
    
    const prType = ctx.repoInfo.provider === "gitlab" ? "MR" : "PR";
    console.log(`[PR] ${prType} created successfully: ${result.url}`);
    return `${prType} created: ${result.url}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[PR] PR creation failed: ${message}`);
    throw new Error(`Failed to create PR: ${message}`);
  }
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "read_file":
      return executeReadFile(ctx, args as { path: string });
    case "write_file":
      return executeWriteFile(ctx, args as { path: string; content: string });
    case "edit_file":
      return executeEditFile(ctx, args as { path: string; search: string; replace: string });
    case "list_directory":
      return executeListDirectory(ctx, args as { path: string });
    case "search_files":
      return executeSearchFiles(ctx, args as { pattern: string; glob?: string });
    case "run_command":
      return executeRunCommand(ctx, args as { command: string });
    case "create_branch":
      return executeCreateBranch(ctx, args as { name: string });
    case "commit_changes":
      return executeCommitChanges(ctx, args as { message: string });
    case "create_pr":
      return executeCreatePR(ctx, args as { title: string; body: string });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
