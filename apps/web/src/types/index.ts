export interface IncidentPayload {
  error_line: string;
  timestamp: string;
  hostname: string;
  repo_url: string;
  context: string[];
}

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

export type IncidentStatus = "open" | "processing" | "fixed" | "not_an_error" | "failed";

export interface ToolCallRecord {
  id: number;
  sessionId: number;
  name: string;
  args: string;
  result: string | null;
  error: string | null;
  createdAt: Date;
}

export interface AgentSessionRecord {
  id: number;
  incidentId: number;
  status: string;
  workDir: string | null;
  branch: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  error: string | null;
}

export type SessionStatus = "pending" | "running" | "completed" | "failed";

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}
