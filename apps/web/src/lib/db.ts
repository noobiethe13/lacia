import initSqlJs, { Database, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';

// Re-export types from central location
export type { Incident, AgentSession, ToolCall, AgentLog } from '@/types';
import type { Incident, AgentSession, ToolCall, AgentLog } from '@/types';

type SqlParams = SqlValue[];

// Database path
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'lacia.db');

// Use globalThis to persist DB across Next.js module reloads in production
// This is the standard pattern for database connections in Next.js
const globalForDb = globalThis as typeof globalThis & {
  sqlJsDb: Database | null;
  sqlJs: Awaited<ReturnType<typeof initSqlJs>> | null;
  dbInitPromise: Promise<Database> | null;
};

// Initialize globals if not set
globalForDb.sqlJsDb = globalForDb.sqlJsDb ?? null;
globalForDb.sqlJs = globalForDb.sqlJs ?? null;
globalForDb.dbInitPromise = globalForDb.dbInitPromise ?? null;

// Initialize database with mutex to prevent race conditions
async function initDB(): Promise<Database> {
  // Fast path: already initialized
  if (globalForDb.sqlJsDb) return globalForDb.sqlJsDb;
  
  // Mutex: if initialization is in progress, wait for it
  if (globalForDb.dbInitPromise) return globalForDb.dbInitPromise;
  
  // Start initialization and store the promise
  globalForDb.dbInitPromise = (async () => {
    // Double-check in case another caller completed while we waited
    if (globalForDb.sqlJsDb) return globalForDb.sqlJsDb;
    
    console.log(`[DB] Initializing database at: ${DB_PATH}`);
    
    // For server-side Node.js, load WASM from node_modules
    const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    
    let wasmBinary: ArrayBuffer | undefined;
    if (fs.existsSync(wasmPath)) {
      const buffer = fs.readFileSync(wasmPath);
      wasmBinary = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    
    globalForDb.sqlJs = await initSqlJs({
      wasmBinary,
    });
    
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      console.log(`[DB] Loading existing database from disk`);
      const fileBuffer = fs.readFileSync(DB_PATH);
      globalForDb.sqlJsDb = new globalForDb.sqlJs.Database(fileBuffer);
      console.log(`[DB] Database loaded, size: ${fileBuffer.length} bytes`);
    } else {
      console.log(`[DB] Creating new database`);
      globalForDb.sqlJsDb = new globalForDb.sqlJs.Database();
      createTables(globalForDb.sqlJsDb);
      saveDB();
    }
    
    return globalForDb.sqlJsDb;
  })();
  
  return globalForDb.dbInitPromise;
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

// Save database to disk atomically
function saveDB(): void {
  if (!globalForDb.sqlJsDb) return;
  const data = globalForDb.sqlJsDb.export();
  const buffer = Buffer.from(data);
  const tempPath = `${DB_PATH}.tmp`;
  
  try {
    // Write to temp file first
    fs.writeFileSync(tempPath, buffer);
    // Atomic rename to actual path (prevents partial reads)
    fs.renameSync(tempPath, DB_PATH);
  } catch (error) {
    console.error("Failed to save database:", error);
    // Try to clean up temp file if it exists
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

// Helper to convert row to typed object
function rowToIncident(row: Record<string, unknown>): Incident {
  return {
    id: row.id as number,
    errorLog: row.error_log as string,
    status: row.status as string,
    hostname: row.hostname as string,
    repoUrl: row.repo_url as string || null,
    context: row.context as string || null,
    prCreated: Boolean(row.pr_created),
    prUrl: row.pr_url as string || null,
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
  console.log(`[DB] getIncidentById(${id}) called`);
  const stmt = database.prepare('SELECT * FROM incidents WHERE id = ?');
  stmt.bind([id]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    console.log(`[DB] getIncidentById(${id}) found row`);
    return rowToIncident(row as Record<string, unknown>);
  }
  stmt.free();
  console.log(`[DB] getIncidentById(${id}) - NOT FOUND`);
  return null;
}

export async function createIncident(data: {
  errorLog: string;
  hostname?: string;
  repoUrl?: string;
  context?: string;
}): Promise<Incident> {
  const database = await initDB();
  
  console.log(`[DB] createIncident called with repoUrl: ${data.repoUrl}`);
  
  // Check for duplicates created in the last 10 seconds
  const stmt = database.prepare(`
    SELECT id, created_at FROM incidents 
    WHERE error_log = ? 
    AND created_at > datetime('now', '-10 seconds')
    ORDER BY created_at DESC LIMIT 1
  `);
  stmt.bind([data.errorLog]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    console.log(`[DB] Skipping duplicate incident (matched ID ${row.id})`);
    const existingIncident = await getIncidentById(row.id as number);
    if (existingIncident) return existingIncident;
    throw new Error("Failed to retrieve existing incident after duplicate check");
  }
  stmt.free();

  // Use database.run() directly for more reliable INSERT
  console.log(`[DB] Inserting new incident...`);
  database.run(
    `INSERT INTO incidents (error_log, hostname, repo_url, context) VALUES (?, ?, ?, ?)`,
    [data.errorLog, data.hostname || 'unknown', data.repoUrl || null, data.context || null]
  );
  
  // Get the created incident ID
  const idResult = database.exec('SELECT last_insert_rowid() as id');
  if (!idResult[0] || !idResult[0].values[0]) {
    console.error(`[DB] Failed to get last_insert_rowid, result:`, idResult);
    throw new Error("Failed to get inserted incident ID");
  }
  const id = idResult[0].values[0][0] as number;
  
  console.log(`[DB] Inserted incident with ID: ${id}`);
  
  // Verify the insert worked by checking row count
  const countResult = database.exec('SELECT COUNT(*) as cnt FROM incidents');
  console.log(`[DB] Total incidents in DB: ${countResult[0]?.values[0]?.[0]}`);
  
  // Save to disk
  saveDB();
  
  const newIncident = await getIncidentById(id);
  if (!newIncident) {
    console.error(`[DB] getIncidentById(${id}) returned null after insert!`);
    // Debug: try raw query
    const debugResult = database.exec(`SELECT * FROM incidents WHERE id = ${id}`);
    console.error(`[DB] Raw query result:`, debugResult);
    throw new Error("Failed to retrieve created incident");
  }
  
  console.log(`[DB] Successfully created incident ${id}`);
  return newIncident;
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
