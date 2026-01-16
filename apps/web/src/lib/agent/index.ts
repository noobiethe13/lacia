import { GoogleGenAI, Content, Part, FunctionCall } from "@google/genai";
import { prisma } from "@/lib/prisma";
import { toolDeclarations } from "./tools";
import { SYSTEM_PROMPT, buildInitialPrompt } from "./prompt";
import { executeTool, ToolContext } from "./executor";
import { cloneRepo, buildFileTree, cleanup } from "@/lib/git";
import { createOctokit, parseRepoUrl } from "@/lib/github";
import simpleGit from "simple-git";

const MAX_TURNS = 30;

export async function runAgent(incidentId: number): Promise<void> {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
  });

  if (!incident || !incident.repoUrl) {
    throw new Error("Incident not found or missing repo URL");
  }

  const session = await prisma.agentSession.create({
    data: {
      incidentId,
      status: "running",
      startedAt: new Date(),
    },
  });

  await prisma.incident.update({
    where: { id: incidentId },
    data: { status: "processing" },
  });

  let workDir: string | null = null;

  try {
    const { owner, repo } = parseRepoUrl(incident.repoUrl);
    const token = process.env.GITHUB_TOKEN || "";

    workDir = await cloneRepo(incident.repoUrl, token);
    
    if (!workDir) throw new Error("Failed to clone repository");

    await prisma.agentSession.update({
      where: { id: session.id },
      data: { workDir },
    });

    const fileTree = await buildFileTree(workDir);
    const context: string[] = incident.context ? JSON.parse(incident.context) : [];

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const git = simpleGit(workDir);
    const octokit = createOctokit(token);

    const ctx: ToolContext = {
      workDir,
      repoUrl: incident.repoUrl,
      owner,
      repo,
      branch: "main",
      git,
      octokit,
    };

    const contents: Content[] = [
      {
        role: "user",
        parts: [{ text: buildInitialPrompt(incident.errorLog, context, fileTree) }],
      },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: toolDeclarations as never[] }],
        },
      });

      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        await logAgentMessage(incidentId, "text", response.text || "");
        break;
      }

      const functionResponseParts: Part[] = [];

      for (const call of functionCalls) {
        const name = call.name || "unknown";
        const args = call.args || {};

        await logToolCall(session.id, name, args);

        if (name === "finish") {
          const finishArgs = args as { reason: string; summary: string };
          await handleFinish(incidentId, session.id, finishArgs, ctx);
          return;
        }

        try {
          const result = await executeTool(ctx, name, args as Record<string, unknown>);
          await updateToolResult(session.id, name, result);
          functionResponseParts.push({
            functionResponse: { name, response: { success: true, result } },
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          await updateToolResult(session.id, name, null, error);
          functionResponseParts.push({
            functionResponse: { name, response: { success: false, error } },
          });
        }
      }

      contents.push({
        role: "model",
        parts: functionCalls.map((c: FunctionCall) => ({ functionCall: c })) as Part[],
      });

      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    await prisma.agentSession.update({
      where: { id: session.id },
      data: { status: "completed", endedAt: new Date() },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.agentSession.update({
      where: { id: session.id },
      data: { status: "failed", error, endedAt: new Date() },
    });
    await prisma.incident.update({
      where: { id: incidentId },
      data: { status: "failed" },
    });
    throw err;
  } finally {
    if (workDir) {
      await cleanup(workDir);
    }
  }
}

async function handleFinish(
  incidentId: number,
  sessionId: number,
  args: { reason: string; summary: string },
  ctx: ToolContext
): Promise<void> {
  await logAgentMessage(incidentId, "finish", JSON.stringify(args));

  const status = args.reason === "fixed" ? "fixed" : args.reason === "not_an_error" ? "not_an_error" : "failed";

  const prUrl = status === "fixed" ? await getPrUrl(ctx) : null;

  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      status,
      prCreated: status === "fixed",
      prUrl,
    },
  });

  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { status: "completed", endedAt: new Date(), branch: ctx.branch },
  });
}

async function getPrUrl(ctx: ToolContext): Promise<string | null> {
  try {
    const { data } = await ctx.octokit.pulls.list({
      owner: ctx.owner,
      repo: ctx.repo,
      head: `${ctx.owner}:${ctx.branch}`,
      state: "open",
    });
    return data[0]?.html_url || null;
  } catch {
    return null;
  }
}

async function logToolCall(sessionId: number, name: string, args: unknown): Promise<void> {
  await prisma.toolCall.create({
    data: {
      sessionId,
      name,
      args: JSON.stringify(args),
    },
  });
}

async function updateToolResult(sessionId: number, name: string, result: string | null, error?: string): Promise<void> {
  const lastCall = await prisma.toolCall.findFirst({
    where: { sessionId, name },
    orderBy: { createdAt: "desc" },
  });

  if (lastCall) {
    await prisma.toolCall.update({
      where: { id: lastCall.id },
      data: { result, error },
    });
  }
}

async function logAgentMessage(incidentId: number, type: string, content: string): Promise<void> {
  await prisma.agentLog.create({
    data: { incidentId, type, content },
  });
}
