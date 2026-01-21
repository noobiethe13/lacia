import { NextResponse } from "next/server";
import { getIncidents, getSessionByIncidentId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const incidents = await getIncidents();
    
    // Get stats
    let active = 0;
    let resolved = 0;
    let failed = 0;
    
    const incidentsWithSessions = await Promise.all(
      incidents.slice(0, 50).map(async (inc) => {
        const session = await getSessionByIncidentId(inc.id);
        if (session) {
          if (session.status === "running") active++;
          else if (session.status === "completed" || session.status === "dry_run") resolved++;
          else if (session.status === "failed" || session.status === "clone_failed") failed++;
        }
        return {
          id: inc.id,
          slug: `INC-${inc.id}`,
          repo_url: inc.repoUrl || "Unknown Repo",
          context: inc.context || inc.errorLog || "No context provided",
          payload: "{}",
          created_at: inc.createdAt.toISOString(),
          status: inc.status,
          agent_session: session ? [{
            status: session.status,
            started_at: session.startedAt ? session.startedAt.toISOString() : new Date().toISOString()
          }] : []
        };
      })
    );

    return NextResponse.json({
      incidents: incidentsWithSessions,
      stats: {
        total: incidents.length,
        active,
        resolved,
        failed
      }
    });
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
