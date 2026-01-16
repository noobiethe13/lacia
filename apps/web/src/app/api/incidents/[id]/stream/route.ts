import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

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

      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        try {
          const session = await prisma.agentSession.findUnique({
            where: { incidentId },
          });

          if (!session) {
            sendEvent({ type: "waiting", message: "Agent not started" });
            return true;
          }

          const newCalls = await prisma.toolCall.findMany({
            where: { sessionId: session.id, id: { gt: lastToolCallId } },
            orderBy: { createdAt: "asc" },
          });

          for (const call of newCalls) {
            sendEvent({
              type: "tool_call",
              name: call.name,
              args: JSON.parse(call.args),
              result: call.result,
              error: call.error,
            });
            lastToolCallId = call.id;
          }

          if (session.status === "completed" || session.status === "failed") {
            const incident = await prisma.incident.findUnique({
              where: { id: incidentId },
            });
            sendEvent({
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
