// Shared type definitions - db.ts re-exports these
// Keep types centralized here to avoid duplication

// ==================== API PAYLOAD TYPES ====================

export interface IncidentPayload {
  error_line: string;
  timestamp: string;
  hostname: string;
  repo_url: string;
  context: string[];
}

// ==================== DATABASE MODEL TYPES ====================

export interface Incident {
  id: number;
  errorLog: string;
  status: string;
  hostname: string;
  repoUrl: string | null;
  context: string | null;
  prCreated: boolean;
  prUrl: string | null;
  createdAt: Date;
}

export interface AgentSession {
  id: number;
  incidentId: number;
  status: string;
  workDir: string | null;
  branch: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  error: string | null;
}

export interface ToolCall {
  id: number;
  sessionId: number;
  name: string;
  args: string | null;
  result: string | null;
  error: string | null;
  createdAt: Date;
}

export interface AgentLog {
  id: number;
  incidentId: number;
  type: string;
  content: string;
  createdAt: Date;
}

// ==================== STATUS TYPES ====================

export type IncidentStatus = 
  | "open" 
  | "processing" 
  | "fixed" 
  | "not_an_error" 
  | "failed"
  | "clone_failed"
  | "pr_skipped";

export type SessionStatus = 
  | "pending" 
  | "running" 
  | "completed" 
  | "failed"
  | "clone_failed"
  | "dry_run";

// ==================== UTILITY TYPES ====================

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}
