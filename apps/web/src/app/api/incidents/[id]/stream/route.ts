import { NextRequest } from "next/server";
import { getSessionByIncidentId, getToolCallsBySessionId, getIncidentById } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incidentId = parseInt(id, 10);

  if (isNaN(incidentId)) {
    return new Response("Invalid incident ID", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastToolCallId = 0;
      let toolCallCounter = 0;

      const sendEvent = (eventType: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        try {
          const session = await getSessionByIncidentId(incidentId);

          if (!session) {
            sendEvent("message", { type: "waiting", message: "Agent not started" });
            return true;
          }

          const allCalls = await getToolCallsBySessionId(session.id);
          const newCalls = allCalls.filter(call => call.id > lastToolCallId);

          for (const call of newCalls) {
            let parsedArgs = {};
            try {
              parsedArgs = call.args ? JSON.parse(call.args) : {};
            } catch {
              parsedArgs = { raw: call.args };
            }
            
            toolCallCounter++;
            sendEvent("tool_call", {
              id: call.id,
              name: call.name,
              args: parsedArgs,
              result: call.result,
              error: call.error,
              status: call.error ? 'failed' : call.result ? 'completed' : 'running',
            });
            lastToolCallId = call.id;
          }

          const terminalStatuses = ["completed", "failed", "dry_run", "clone_failed"];
          if (terminalStatuses.includes(session.status)) {
            const incident = await getIncidentById(incidentId);
            sendEvent("message", {
              type: "done",
              status: session.status,
              incidentStatus: incident?.status,
              prUrl: incident?.prUrl,
            });
            return false;
          }

          return true;
        } catch {
          return false;
        }
      };

      let shouldContinue = true;
      while (shouldContinue) {
        shouldContinue = await poll();
        if (shouldContinue) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
