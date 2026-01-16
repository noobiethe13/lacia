import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { IncidentPayload } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IncidentPayload;

    if (!body.error_line || !body.timestamp) {
      return NextResponse.json(
        { error: "Missing required fields: error_line, timestamp" },
        { status: 400 }
      );
    }

    const incident = await prisma.incident.create({
      data: {
        errorLog: body.error_line,
        hostname: body.hostname || "unknown",
        repoUrl: body.repo_url || null,
        context: body.context ? JSON.stringify(body.context) : null,
        status: "open",
      },
    });

    if (body.repo_url) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      fetch(`${baseUrl}/api/queue/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: incident.id }),
      }).catch(() => {});
    }

    return NextResponse.json(
      { success: true, incidentId: incident.id },
      { status: 200 }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
