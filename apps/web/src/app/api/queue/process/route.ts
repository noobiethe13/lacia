import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export async function POST(request: NextRequest) {
  try {
    const { incidentId } = await request.json();

    if (!incidentId) {
      return NextResponse.json({ error: "Missing incidentId" }, { status: 400 });
    }

    runAgent(incidentId).catch((err) => {
      console.error(`Agent failed for incident ${incidentId}:`, err);
    });

    return NextResponse.json({ success: true, message: "Agent started" });
  } catch (error) {
    console.error("Queue processor error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
