"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  GitBranch, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Incident {
  id: number;
  slug: string;
  repo_url: string;
  context: string;
  payload: string;
  created_at: string;
  status: string;
  agent_session?: {
    status: string;
    started_at: string;
  }[];
}

interface Stats {
  total: number;
  active: number;
  resolved: number;
  failed: number;
}

interface DashboardOverviewProps {
  initialIncidents: Incident[];
  stats: Stats;
}

const POLL_INTERVAL = 5000; // 5 seconds

export function DashboardOverview({ initialIncidents, stats: initialStats }: DashboardOverviewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [incidents, setIncidents] = useState(initialIncidents);
  const [stats, setStats] = useState(initialStats);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard");
      if (response.ok) {
        const data = await response.json();
        setIncidents(data.incidents);
        setStats(data.stats);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    }
  }, []);

  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isPolling, fetchData]);

  const filteredIncidents = incidents.filter(incident => 
    incident.context.toLowerCase().includes(searchQuery.toLowerCase()) ||
    incident.repo_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
    incident.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Incidents</h2>
          <button
            onClick={() => { fetchData(); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn(
              "w-2 h-2 rounded-full",
              isPolling ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
            )} />
            <span>
              {isPolling ? "Auto-refresh on" : "Paused"} • Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        </div>
        <div className="relative w-64 md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search incidents..." 
            className="pl-9 bg-card border-border transition-all focus:ring-2 focus:ring-primary/20"
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Repository & Context</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="relative">
            <AnimatePresence mode="wait">
            {filteredIncidents.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No incidents found.
                    </TableCell>
                </TableRow>
            ) : (
                filteredIncidents.map((incident, index) => {
                  const agentStatus = incident.agent_session?.[0]?.status || "unknown";
                  
                  return (
                    <motion.tr 
                      key={incident.id} 
                      className="group cursor-pointer hover:bg-muted/30 border-b border-border/50 last:border-0"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{incident.slug}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Link href={`/incidents/${incident.id}`} className="font-medium group-hover:text-primary transition-colors">
                            {incident.context.length > 60 ? incident.context.substring(0, 60) + "..." : incident.context}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <GitBranch className="w-3 h-3" />
                            <span>{incident.repo_url.replace("https://github.com/", "")}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                         <div className={cn(
                           "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-sm transition-all",
                           agentStatus === "completed" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                           agentStatus === "dry_run" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                           agentStatus === "clone_failed" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                           agentStatus === "pr_failed" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                           agentStatus === "failed" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                           agentStatus === "running" ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 animate-pulse" :
                           "bg-gray-500/10 text-gray-500 border-gray-500/20"
                         )}>
                           {agentStatus === "completed" && <CheckCircle2 className="w-3 h-3" />}
                           {agentStatus === "dry_run" && <CheckCircle2 className="w-3 h-3" />}
                           {(agentStatus === "failed" || agentStatus === "clone_failed") && <XCircle className="w-3 h-3" />}
                           {agentStatus === "pr_failed" && <AlertCircle className="w-3 h-3" />}
                           {agentStatus === "running" && <Clock className="w-3 h-3" />}
                           <span className="capitalize">{agentStatus.replace("_", " ")}</span>
                         </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(incident.created_at).toLocaleDateString()} {new Date(incident.created_at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/incidents/${incident.id}`} className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                      </TableCell>
                    </motion.tr>
                  );
                })
            )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
