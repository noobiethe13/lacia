import { GoogleGenAI, Content, Part, FunctionCall } from "@google/genai";
import { 
  getIncidentById, 
  createSession, 
  updateSession, 
  updateIncident,
  createToolCall,
  updateToolCall,
  createAgentLog,
  getToolCallsBySessionId 
} from "@/lib/db";
import { toolDeclarations } from "./tools";
import { SYSTEM_PROMPT, buildInitialPrompt } from "./prompt";
import { executeTool, ToolContext, PrSkippedError } from "./executor";
import { cloneRepo, buildFileTree, cleanup, CloneError } from "@/lib/git";
import { createOctokit, parseRepoUrl } from "@/lib/github";
import simpleGit from "simple-git";

const MAX_TURNS = 30;

export async function runAgent(incidentId: number): Promise<void> {
  const incident = await getIncidentById(incidentId);

  if (!incident || !incident.repoUrl) {
    throw new Error("Incident not found or missing repo URL");
  }

  const session = await createSession({
    incidentId,
    status: "running",
    startedAt: new Date(),
  });

  await updateIncident(incidentId, { status: "processing" });

  let workDir: string | null = null;
  let prSkipped = false; // Track if PR was skipped (dry-run mode)

  try {
    const { owner, repo } = parseRepoUrl(incident.repoUrl);
    const token = process.env.GITHUB_TOKEN || "";

    workDir = await cloneRepo(incident.repoUrl, token);
    
    if (!workDir) throw new Error("Failed to clone repository");

    await updateSession(session.id, { workDir });

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
      console.log(`[Agent] Turn ${turn + 1}/${MAX_TURNS} - Calling Gemini...`);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: toolDeclarations as never[] }],
        },
      });

      // Verbose logging: log full response structure
      const responseText = response.text || "";
      const functionCalls = response.functionCalls;
      const modelParts = response.candidates?.[0]?.content?.parts || [];
      
      console.log(`[Agent] Response received - Text: ${responseText.substring(0, 200)}${responseText.length > 200 ? "..." : ""}`);
      console.log(`[Agent] Function calls: ${functionCalls?.length || 0}, Parts: ${modelParts.length}`);

      // Log any text/reasoning from Gemini (before or alongside function calls)
      if (responseText && responseText.trim()) {
        await logAgentMessage(incidentId, "gemini_response", responseText);
        console.log(`[Agent] Logged Gemini text response to database`);
      }

      if (!functionCalls || functionCalls.length === 0) {
        console.log(`[Agent] No function calls - ending turn loop`);
        break;
      }

      // Get the raw parts from the response to preserve thoughtSignature

      const functionResponseParts: Part[] = [];

      for (const call of functionCalls) {
        const name = call.name || "unknown";
        const args = call.args || {};

        await logToolCall(session.id, name, args);

        if (name === "finish") {
          const finishArgs = args as { reason: string; summary: string };
          await handleFinish(incidentId, session.id, finishArgs, ctx, prSkipped);
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
          
          // Track if PR was skipped (dry-run mode)
          if (err instanceof PrSkippedError) {
            prSkipped = true;
          }
          
          functionResponseParts.push({
            functionResponse: { name, response: { success: false, error } },
          });
        }
      }

      // Preserve original parts (includes thoughtSignature) instead of reconstructing
      contents.push({
        role: "model",
        parts: modelParts as Part[],
      });

      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    await updateSession(session.id, { status: "completed", endedAt: new Date() });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    
    // Handle specific error types with appropriate statuses
    let sessionStatus = "failed";
    let incidentStatus = "failed";
    
    if (err instanceof CloneError) {
      sessionStatus = "clone_failed";
      incidentStatus = "clone_failed";
    }
    
    await updateSession(session.id, { 
      status: sessionStatus, 
      error, 
      endedAt: new Date() 
    });
    await updateIncident(incidentId, { status: incidentStatus });
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
  ctx: ToolContext,
  prSkipped: boolean = false
): Promise<void> {
  await logAgentMessage(incidentId, "finish", JSON.stringify(args));

  let status: string;
  let sessionStatus: string;
  let prUrl: string | null = null;

  if (args.reason === "fixed") {
    if (prSkipped) {
      // Fix was applied but PR was not created (dry-run mode)
      status = "pr_skipped";
      sessionStatus = "dry_run";
    } else {
      status = "fixed";
      sessionStatus = "completed";
      prUrl = await getPrUrl(ctx);
    }
  } else if (args.reason === "not_an_error") {
    status = "not_an_error";
    sessionStatus = "completed";
  } else {
    status = "failed";
    sessionStatus = "failed";
  }

  await updateIncident(incidentId, {
    status,
    prCreated: status === "fixed",
    prUrl: prUrl || undefined,
  });

  await updateSession(sessionId, { 
    status: sessionStatus, 
    endedAt: new Date(), 
    branch: ctx.branch 
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
  await createToolCall({
    sessionId,
    name,
    args: JSON.stringify(args),
  });
}

async function updateToolResult(sessionId: number, name: string, result: string | null, error?: string): Promise<void> {
  const toolCalls = await getToolCallsBySessionId(sessionId);
  const lastCall = toolCalls
    .filter(tc => tc.name === name)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (lastCall) {
    await updateToolCall(lastCall.id, { 
      result: result || undefined, 
      error 
    });
  }
}

async function logAgentMessage(incidentId: number, type: string, content: string): Promise<void> {
  await createAgentLog({ incidentId, type, content });
}
