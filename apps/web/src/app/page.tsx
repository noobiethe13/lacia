import { prisma } from "@/lib/prisma";
import type { Incident } from "@/types";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-red-500/20 text-red-400 border-red-500/30",
    investigating: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    resolved: "bg-green-500/20 text-green-400 border-green-500/30",
    closed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full border ${colors[status] || colors.open}`}
    >
      {status}
    </span>
  );
}

export default async function Dashboard() {
  let incidents: Incident[] = [];
  let error: string | null = null;

  try {
    const data = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    incidents = data.map((i) => ({
      id: i.id,
      errorLog: i.errorLog,
      status: i.status,
      hostname: i.hostname,
      repoUrl: i.repoUrl,
      context: i.context,
      prCreated: i.prCreated,
      prUrl: i.prUrl,
      createdAt: i.createdAt,
    }));
  } catch (e) {
    error = "Failed to connect to database. Run `npx prisma db push` first.";
    console.error(e);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Project Lacia
            </h1>
          </div>
          <p className="text-gray-400">
            Autonomous SRE Agent — Incident Dashboard
          </p>
        </header>

        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Recent Incidents
            </h2>
            <span className="text-sm text-gray-500">Last 10</span>
          </div>

          {error ? (
            <div className="px-6 py-12 text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <code className="text-sm text-gray-500 bg-gray-800 px-3 py-1 rounded">
                npx prisma db push
              </code>
            </div>
          ) : incidents.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-400 font-medium">No incidents yet</p>
              <p className="text-gray-500 text-sm mt-1">
                System is running smoothly
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="px-6 py-4 hover:bg-gray-800/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-gray-500 text-sm font-mono">
                          #{incident.id}
                        </span>
                        <StatusBadge status={incident.status} />
                        <span className="text-gray-600 text-xs">
                          {incident.hostname}
                        </span>
                      </div>
                      <p className="text-gray-300 font-mono text-sm truncate">
                        {incident.errorLog}
                      </p>
                    </div>
                    <time className="text-gray-500 text-sm whitespace-nowrap">
                      {formatDate(new Date(incident.createdAt))}
                    </time>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="mt-8 text-center text-gray-600 text-sm">
          Powered by Gemini 3 Agent
        </footer>
      </div>
    </div>
  );
}
