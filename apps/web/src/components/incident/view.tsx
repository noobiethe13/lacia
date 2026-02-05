"use client";

import { useEffect, useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Terminal } from "@/components/incident/terminal";
import { useIncidentStream, LogRecord, ToolCallRecord } from "@/lib/hooks/use-incident-stream";
import { 
  Bot, 
  Terminal as TerminalIcon, 
  GitBranch, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  ChevronDown,
  ExternalLink,
  Code,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IncidentViewProps {
  incidentId: number;
  initialLogs: LogRecord[];
  initialToolCalls: ToolCallRecord[];
  initialStatus: string;
}

function ToolCallItem({ tool }: { tool: ToolCallRecord }) {
  const [isOpen, setIsOpen] = useState(tool.status === "running");
  const isPending = tool.status === "running";
  const isFailed = tool.status === "failed";

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden mb-2 shadow-sm transition-all">
      <div 
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center border",
          isPending ? "bg-blue-500/10 border-blue-500/20 text-blue-600 animate-pulse" :
          isFailed ? "bg-red-500/10 border-red-500/20 text-red-600" :
          "bg-indigo-500/10 border-indigo-500/20 text-indigo-600"
        )}>
          <TerminalIcon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium font-mono text-foreground">{tool.name}</span>
            <span className="text-xs text-muted-foreground">{new Date(tool.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </div>
      
      {isOpen && (
        <div className="border-t border-border bg-muted/20 p-3 text-xs font-mono space-y-3">
          <div>
            <span className="text-muted-foreground uppercase tracking-wider text-[10px] block mb-1">Arguments</span>
            <pre className="text-foreground whitespace-pre-wrap">{JSON.stringify(tool.args, null, 2)}</pre>
          </div>
          {tool.result !== null && tool.result !== undefined && (
             <div>
               <span className="text-emerald-600 uppercase tracking-wider text-[10px] block mb-1">Result</span>
               <pre className="text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto custom-scrollbar">{typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}</pre>
             </div>
          )}
          {tool.error && (
             <div>
               <span className="text-red-500 uppercase tracking-wider text-[10px] block mb-1">Error</span>
               <pre className="text-red-600 whitespace-pre-wrap">{tool.error}</pre>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

export function IncidentView({ incidentId, initialLogs, initialToolCalls, initialStatus }: IncidentViewProps) {
  const { logs: liveLogs, toolCalls: liveToolCalls, connected } = useIncidentStream(incidentId);
  const [activeTab, setActiveTab] = useState<"activity" | "logs">("activity");
  
  const allLogs = [...initialLogs, ...liveLogs];
  
  const toolsMap = new Map(initialToolCalls.map(t => [t.id, t]));
  liveToolCalls.forEach(t => toolsMap.set(t.id, t));
  const allTools = Array.from(toolsMap.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allLogs, allTools]);

  return (
    <div className="h-[calc(100vh-12rem)] grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel: Context & Logs */}
      <div className="lg:col-span-2 space-y-4 flex flex-col h-full">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border w-fit">
            <button 
                onClick={() => setActiveTab("activity")}
                className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", activeTab === "activity" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
                <Activity className="w-3.5 h-3.5" />
                Activity
            </button>
            <button 
                onClick={() => setActiveTab("logs")}
                className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2", activeTab === "logs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
                <TerminalIcon className="w-3.5 h-3.5" />
                Raw Logs
            </button>
            </div>
            
            {connected && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-medium">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Connected
                </div>
            )}
        </div>

        <Card className="flex-1 overflow-hidden flex flex-col min-h-0 bg-background/50">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={scrollRef}>
             {activeTab === "activity" ? (
               <div className="space-y-4">
                 {allTools.length === 0 && (
                   <div className="text-center text-muted-foreground py-12">
                     <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
                     <p>Agent is initialized and waiting for tasks...</p>
                   </div>
                 )}
                 {allTools.map(tool => (
                   <ToolCallItem key={tool.id} tool={tool} />
                 ))}
               </div>
             ) : (
               <div className="font-mono text-xs space-y-1.5">
                 {allLogs.map((log, i) => (
                   <div key={i} className="flex gap-3 text-muted-foreground border-b border-border/50 pb-1 last:border-0 hover:bg-muted/30 px-2 rounded">
                     <span className="text-muted-foreground/60 shrink-0 w-20">{new Date(log.timestamp).toLocaleTimeString()}</span>
                     <span className={cn(
                       log.type === "error" ? "text-red-500" : 
                       log.type === "success" ? "text-emerald-500" : "text-foreground"
                     )}>
                       {log.content}
                     </span>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </Card>
      </div>

      {/* Right Panel: Agent Status */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="w-4 h-4 text-primary" />
              Agent Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
             <div className="flex flex-col gap-4">
               <div className="relative pl-6 space-y-8 border-l border-border ml-2">
                 {[
                   { id: 1, label: "Analysis", desc: "Understanding the error context" },
                   { id: 2, label: "Diagnosis", desc: "Identifying root cause" },
                   { id: 3, label: "Fix Implementation", desc: "Applying code changes" },
                   { id: 4, label: "Verification", desc: "Running tests & validation" },
                 ].map((step, idx) => {
                   let isActive = false;
                   let isCompleted = false;
                   
                   if (allTools.length > 0) {
                        const stepValue = idx + 1;
                        const currentStep = allTools.length < 3 ? 1 : allTools.length < 6 ? 2 : allTools.length < 10 ? 3 : 4;
                        if (currentStep === stepValue) isActive = true;
                        if (currentStep > stepValue) isCompleted = true;
                   } else if (idx === 0) {
                       isActive = true;
                   }
                   
                   return (
                     <div key={step.id} className="relative group">
                       <div className={cn(
                         "absolute -left-[29px] top-1 w-4 h-4 rounded-full border-4 transition-all duration-500 bg-background",
                         isCompleted ? "border-emerald-500" :
                         isActive ? "border-primary animate-pulse shadow-[0_0_0_4px_rgba(var(--primary),0.1)]" :
                         "border-muted"
                       )} />
                       <h4 className={cn("text-sm font-medium transition-colors", isActive || isCompleted ? "text-foreground" : "text-muted-foreground")}>
                         {step.label}
                       </h4>
                       <p className="text-xs text-muted-foreground mt-0.5 group-hover:text-foreground transition-colors">{step.desc}</p>
                     </div>
                   );
                 })}
               </div>
             </div>
          </CardContent>
        </Card>
        
        {/* Actions */}
        <Card>
            <CardContent className="p-4">
                <button className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-sm font-medium border border-destructive/20 cursor-not-allowed opacity-50" disabled>
                    <XCircle className="w-4 h-4" />
                    Stop Agent (Coming Soon)
                </button>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
