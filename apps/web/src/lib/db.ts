import initSqlJs, { Database, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';

// Re-export types from central location
export type { Incident, AgentSession, ToolCall, AgentLog } from '@/types';
import type { Incident, AgentSession, ToolCall, AgentLog } from '@/types';

type SqlParams = SqlValue[];

// Database path
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'lacia.db');

let db: Database | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

// Initialize database
async function initDB(): Promise<Database> {
  if (db) return db;
  
  // For server-side Node.js, load WASM from node_modules
  const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  
  let wasmBinary: ArrayBuffer | undefined;
  if (fs.existsSync(wasmPath)) {
    const buffer = fs.readFileSync(wasmPath);
    wasmBinary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  
  SQL = await initSqlJs({
    wasmBinary,
  });
  
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    createTables(db);
    saveDB();
  }
  
  return db;
}

// Create tables
function createTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_log TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      hostname TEXT DEFAULT 'unknown',
      repo_url TEXT,
      context TEXT,
      pr_created INTEGER DEFAULT 0,
      pr_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      work_dir TEXT,
      branch TEXT,
      started_at TEXT,
      ended_at TEXT,
      error TEXT,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      args TEXT,
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
    )
  `);
  
  database.run(`
    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )
  `);
}

// Save database to file
function saveDB(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Helper to convert row to typed object
function rowToIncident(row: Record<string, unknown>): Incident {
  return {
    id: row.id as number,
    errorLog: row.error_log as string,
    status: row.status as string,
    hostname: row.hostname as string,
    repoUrl: row.repo_url as string | null,
    context: row.context as string | null,
    prCreated: Boolean(row.pr_created),
    prUrl: row.pr_url as string | null,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToSession(row: Record<string, unknown>): AgentSession {
  return {
    id: row.id as number,
    incidentId: row.incident_id as number,
    status: row.status as string,
    workDir: row.work_dir as string | null,
    branch: row.branch as string | null,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
    error: row.error as string | null,
  };
}

function rowToToolCall(row: Record<string, unknown>): ToolCall {
  return {
    id: row.id as number,
    sessionId: row.session_id as number,
    name: row.name as string,
    args: row.args as string | null,
    result: row.result as string | null,
    error: row.error as string | null,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToAgentLog(row: Record<string, unknown>): AgentLog {
  return {
    id: row.id as number,
    incidentId: row.incident_id as number,
    type: row.type as string,
    content: row.content as string,
    createdAt: new Date(row.created_at as string),
  };
}

// ==================== INCIDENTS ====================

export async function getIncidents(): Promise<Incident[]> {
  const database = await initDB();
  const result = database.exec('SELECT * FROM incidents ORDER BY created_at DESC');
  if (!result[0]) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return rowToIncident(obj);
  });
}

export async function getIncidentById(id: number): Promise<Incident | null> {
  const database = await initDB();
  const stmt = database.prepare('SELECT * FROM incidents WHERE id = ?');
  stmt.bind([id]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return rowToIncident(row as Record<string, unknown>);
  }
  stmt.free();
  return null;
}

export async function createIncident(data: {
  errorLog: string;
  hostname?: string;
  repoUrl?: string;
  context?: string;
}): Promise<Incident> {
  const database = await initDB();
  database.run(
    `INSERT INTO incidents (error_log, hostname, repo_url, context) VALUES (?, ?, ?, ?)`,
    [data.errorLog, data.hostname || 'unknown', data.repoUrl || null, data.context || null]
  );
  
  const result = database.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0] as number;
  saveDB();
  
  return (await getIncidentById(id))!;
}

export async function updateIncident(id: number, data: Partial<{
  status: string;
  prCreated: boolean;
  prUrl: string;
}>): Promise<Incident | null> {
  const database = await initDB();
  
  const updates: string[] = [];
  const values: SqlParams = [];
  
  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.prCreated !== undefined) {
    updates.push('pr_created = ?');
    values.push(data.prCreated ? 1 : 0);
  }
  if (data.prUrl !== undefined) {
    updates.push('pr_url = ?');
    values.push(data.prUrl);
  }
  
  if (updates.length === 0) return getIncidentById(id);
  
  values.push(id);
  database.run(`UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`, values as SqlParams);
  saveDB();
  
  return getIncidentById(id);
}

// ==================== AGENT SESSIONS ====================

export async function getSessionByIncidentId(incidentId: number): Promise<AgentSession | null> {
  const database = await initDB();
  const stmt = database.prepare('SELECT * FROM agent_sessions WHERE incident_id = ?');
  stmt.bind([incidentId]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return rowToSession(row as Record<string, unknown>);
  }
  stmt.free();
  return null;
}

export async function createSession(data: {
  incidentId: number;
  status?: string;
  startedAt?: Date;
}): Promise<AgentSession> {
  const database = await initDB();
  database.run(
    `INSERT INTO agent_sessions (incident_id, status, started_at) VALUES (?, ?, ?)`,
    [data.incidentId, data.status || 'pending', data.startedAt?.toISOString() || null]
  );
  
  const result = database.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0] as number;
  saveDB();
  
  const stmt = database.prepare('SELECT * FROM agent_sessions WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return rowToSession(row as Record<string, unknown>);
}

export async function updateSession(id: number, data: Partial<{
  status: string;
  workDir: string;
  branch: string;
  endedAt: Date;
  error: string;
}>): Promise<AgentSession | null> {
  const database = await initDB();
  
  const updates: string[] = [];
  const values: SqlParams = [];
  
  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.workDir !== undefined) {
    updates.push('work_dir = ?');
    values.push(data.workDir);
  }
  if (data.branch !== undefined) {
    updates.push('branch = ?');
    values.push(data.branch);
  }
  if (data.endedAt !== undefined) {
    updates.push('ended_at = ?');
    values.push(data.endedAt.toISOString());
  }
  if (data.error !== undefined) {
    updates.push('error = ?');
    values.push(data.error);
  }
  
  if (updates.length === 0) return null;
  
  values.push(id);
  database.run(`UPDATE agent_sessions SET ${updates.join(', ')} WHERE id = ?`, values as SqlParams);
  saveDB();
  
  const stmt = database.prepare('SELECT * FROM agent_sessions WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return rowToSession(row as Record<string, unknown>);
}

// ==================== TOOL CALLS ====================

export async function getToolCallsBySessionId(sessionId: number): Promise<ToolCall[]> {
  const database = await initDB();
  const result = database.exec(`SELECT * FROM tool_calls WHERE session_id = ${sessionId} ORDER BY created_at ASC`);
  if (!result[0]) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return rowToToolCall(obj);
  });
}

export async function createToolCall(data: {
  sessionId: number;
  name: string;
  args?: string;
}): Promise<ToolCall> {
  const database = await initDB();
  database.run(
    `INSERT INTO tool_calls (session_id, name, args) VALUES (?, ?, ?)`,
    [data.sessionId, data.name, data.args || null]
  );
  
  const result = database.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0] as number;
  saveDB();
  
  const stmt = database.prepare('SELECT * FROM tool_calls WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return rowToToolCall(row as Record<string, unknown>);
}

export async function updateToolCall(id: number, data: Partial<{
  result: string;
  error: string;
}>): Promise<void> {
  const database = await initDB();
  
  const updates: string[] = [];
  const values: SqlParams = [];
  
  if (data.result !== undefined) {
    updates.push('result = ?');
    values.push(data.result);
  }
  if (data.error !== undefined) {
    updates.push('error = ?');
    values.push(data.error);
  }
  
  if (updates.length === 0) return;
  
  values.push(id);
  database.run(`UPDATE tool_calls SET ${updates.join(', ')} WHERE id = ?`, values as SqlParams);
  saveDB();
}

// ==================== AGENT LOGS ====================

export async function getLogsByIncidentId(incidentId: number): Promise<AgentLog[]> {
  const database = await initDB();
  const result = database.exec(`SELECT * FROM agent_logs WHERE incident_id = ${incidentId} ORDER BY created_at ASC`);
  if (!result[0]) return [];
  
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return rowToAgentLog(obj);
  });
}

export async function createAgentLog(data: {
  incidentId: number;
  type: string;
  content: string;
}): Promise<AgentLog> {
  const database = await initDB();
  database.run(
    `INSERT INTO agent_logs (incident_id, type, content) VALUES (?, ?, ?)`,
    [data.incidentId, data.type, data.content]
  );
  
  const result = database.exec('SELECT last_insert_rowid() as id');
  const id = result[0].values[0][0] as number;
  saveDB();
  
  const stmt = database.prepare('SELECT * FROM agent_logs WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return rowToAgentLog(row as Record<string, unknown>);
}

// Get incident with related data (for detail page)
export async function getIncidentWithRelations(id: number): Promise<{
  incident: Incident;
  session: AgentSession | null;
  toolCalls: ToolCall[];
  logs: AgentLog[];
} | null> {
  const incident = await getIncidentById(id);
  if (!incident) return null;
  
  const session = await getSessionByIncidentId(id);
  const toolCalls = session ? await getToolCallsBySessionId(session.id) : [];
  const logs = await getLogsByIncidentId(id);
  
  return { incident, session, toolCalls, logs };
}
