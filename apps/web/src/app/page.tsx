import { getIncidents, getSessionByIncidentId } from "@/lib/db";
import { DashboardOverview } from "@/components/dashboard/overview";
import { cn } from "@/lib/utils";
import Image from "next/image";

export const dynamic = "force-dynamic";

async function getStats() {
  const incidents = await getIncidents();
  const total = incidents.length;
  
  // Get session statuses
  let active = 0;
  let resolved = 0;
  let failed = 0;
  
  for (const incident of incidents) {
    const session = await getSessionByIncidentId(incident.id);
    if (session) {
      if (session.status === "running") active++;
      else if (session.status === "completed" || session.status === "dry_run") resolved++;
      else if (session.status === "failed" || session.status === "clone_failed") failed++;
    }
  }

  return { total, active, resolved, failed };
}

async function getRecentIncidents() {
  const incidents = await getIncidents();
  
  // Get session for each incident
  const incidentsWithSessions = await Promise.all(
    incidents.slice(0, 50).map(async (inc) => {
      const session = await getSessionByIncidentId(inc.id);
      return { ...inc, session };
    })
  );
  
  return incidentsWithSessions;
}

export default async function DashboardPage() {
  const stats = await getStats();
  const incidents = await getRecentIncidents();
  
  const formattedIncidents = incidents.map((inc) => ({
    id: inc.id,
    slug: `INC-${inc.id}`,
    source: inc.hostname || "Unknown Host",
    repo_url: inc.repoUrl || "Unknown Repo",
    context: inc.context || inc.errorLog || "No context provided",
    payload: "{}",
    created_at: inc.createdAt.toISOString(),
    status: inc.status,
    agent_session: inc.session ? [{
       status: inc.session.status,
       started_at: inc.session.startedAt ? inc.session.startedAt.toISOString() : new Date().toISOString()
    }] : []
  }));

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Premium Gradient Background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/10 via-background to-background pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto p-8 space-y-10">
        {/* Header */}
        <header className="flex items-center justify-between pb-6 border-b border-border/40 backdrop-blur-sm sticky top-0 z-10 bg-background/80 -mx-8 px-8 py-4 transition-all">
          <div className="flex items-center gap-4">
             <div className="relative h-10 w-10 shadow-lg rounded-xl overflow-hidden ring-1 ring-white/10">
                <Image src="/icon.png" alt="Lacia Icon" fill className="object-cover" />
             </div>
             <div>
               <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Lacia</h1>
             </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-600 font-medium text-xs">System Operational</span>
             </div>
          </div>
        </header>

        {/* Overview Stats Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
           {[
             { label: "Total Incidents", value: stats.total, sub: "Lifetime count", color: "text-foreground" },
             { label: "Active Agents", value: stats.active, sub: "Currently running", color: "text-indigo-500" },
             { label: "Resolved", value: stats.resolved, sub: "Successfully fixed", color: "text-emerald-500" },
             { label: "Failed", value: stats.failed, sub: "Requires intervention", color: "text-red-500" },
           ].map((stat, i) => (
             <div key={i} className="group relative p-6 rounded-2xl border border-border bg-card/50 hover:bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 backdrop-blur-sm">
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-2">{stat.label}</div>
                    <div className={cn("text-4xl font-bold tracking-tight", stat.color)}>{stat.value}</div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 group-hover:text-foreground transition-colors">
                      {stat.sub}
                    </div>
                  </div>
                </div>
             </div>
           ))}
        </div>

        {/* Main Content */}
        <div className="relative z-0">
           <DashboardOverview initialIncidents={formattedIncidents} stats={stats} />
        </div>
      </div>
    </div>
  );
}
