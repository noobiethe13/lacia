import { getIncidentWithRelations } from "@/lib/db";
import { IncidentView } from "@/components/incident/view";
import { notFound } from "next/navigation";
import { LogRecord, ToolCallRecord } from "@/lib/hooks/use-incident-stream";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Prevent caching - always fetch fresh data
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function IncidentPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  
  if (isNaN(id)) notFound();

  const data = await getIncidentWithRelations(id);
  
  if (!data) notFound();
  
  const { incident, session, toolCalls, logs } = data;

  // Transform db types to View types
  const initialToolCalls: ToolCallRecord[] = toolCalls.map(tc => {
      let parsedArgs = {};
      try {
          parsedArgs = tc.args ? JSON.parse(tc.args) : {};
      } catch {
          parsedArgs = { raw: tc.args };
      }

      return {
          id: tc.id,
          name: tc.name,
          args: parsedArgs,
          result: tc.result,
          error: tc.error || undefined,
          status: tc.error ? 'failed' : tc.result ? 'completed' : 'running',
          timestamp: tc.createdAt.toISOString()
      };
  });

  const initialLogs: LogRecord[] = logs.map(log => ({
      id: log.id,
      type: log.type,
      content: log.content,
      timestamp: log.createdAt.toISOString()
  }));

  // Infer agent status from session or defaulting to incident status
  const agentStatus = session?.status || incident.status;
  const contextText = incident.context || incident.errorLog || "Incident Report";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 p-6">
       <div className="max-w-[1600px] mx-auto">
          <header className="mb-6">
              <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
                  <Link href="/" className="hover:text-foreground transition-colors flex items-center gap-1">
                      <ChevronLeft className="w-3 h-3" />
                      Back to Dashboard
                  </Link>
                  <span className="text-border">/</span>
                  <span>Incident #{id}</span>
              </div>
              <div className="flex items-center justify-between">
                  <div>
                      <h1 className="text-xl font-bold flex items-center gap-3">
                          <span className="text-muted-foreground font-mono">#{id}</span>
                          <span>{contextText.split('\n')[0]}</span>
                      </h1>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant="neutral" className="font-mono">INC-{id}</Badge>
                        <span className="text-sm text-muted-foreground">
                            {incident.repoUrl || "No Repo"} • {new Date(incident.createdAt).toLocaleString()}
                        </span>
                      </div>
                  </div>
              </div>
          </header>
          
          <IncidentView 
             incidentId={id}
             initialLogs={initialLogs}
             initialToolCalls={initialToolCalls}
             initialStatus={agentStatus}
          />
       </div>
    </div>
  );
}
