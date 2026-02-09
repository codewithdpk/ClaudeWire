import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';
import fs from 'fs';
import path from 'path';

const log = logger.child({ component: 'sqlite' });

let db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    thread_ts TEXT NOT NULL,
    project_path TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ended_at TEXT,
    exit_code INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
`;

export function getDatabase(): Database.Database {
  if (db) return db;

  // Ensure directory exists
  const dir = path.dirname(config.sqlite.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.sqlite.path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  log.info({ path: config.sqlite.path }, 'SQLite database initialized');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info('SQLite connection closed');
  }
}

export interface SessionLogEntry {
  id: string;
  userId: string;
  userName: string;
  channelId: string;
  threadTs: string;
  projectPath: string;
  status: string;
  createdAt: string;
  endedAt?: string;
  exitCode?: number;
}

export interface MessageLogEntry {
  sessionId: string;
  role: 'user' | 'claude' | 'system';
  content: string;
  timestamp: string;
}

export class SQLiteLogger {
  constructor(private database: Database.Database) {}

  logSessionStart(session: {
    id: string;
    userId: string;
    userName: string;
    channelId: string;
    threadTs: string;
    projectPath: string;
  }): void {
    try {
      const stmt = this.database.prepare(`
        INSERT INTO sessions (id, user_id, user_name, channel_id, thread_ts, project_path, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
      `);
      stmt.run(
        session.id,
        session.userId,
        session.userName,
        session.channelId,
        session.threadTs,
        session.projectPath,
        new Date().toISOString()
      );
      log.debug({ sessionId: session.id }, 'Session logged');
    } catch (err) {
      log.error({ err, sessionId: session.id }, 'Failed to log session start');
      throw new StorageError('logSessionStart', err as Error);
    }
  }

  logSessionEnd(sessionId: string, exitCode?: number): void {
    try {
      const stmt = this.database.prepare(`
        UPDATE sessions SET status = 'terminated', ended_at = ?, exit_code = ?
        WHERE id = ?
      `);
      stmt.run(new Date().toISOString(), exitCode ?? null, sessionId);
      log.debug({ sessionId, exitCode }, 'Session end logged');
    } catch (err) {
      log.error({ err, sessionId }, 'Failed to log session end');
      throw new StorageError('logSessionEnd', err as Error);
    }
  }

  logMessage(sessionId: string, role: MessageLogEntry['role'], content: string): void {
    try {
      const stmt = this.database.prepare(`
        INSERT INTO messages (session_id, role, content, timestamp)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(sessionId, role, content, new Date().toISOString());
    } catch (err) {
      log.error({ err, sessionId, role }, 'Failed to log message');
      // Don't throw - message logging is non-critical
    }
  }

  getSessionHistory(userId: string, limit = 10): SessionLogEntry[] {
    const stmt = this.database.prepare(`
      SELECT id, user_id as userId, user_name as userName, channel_id as channelId,
             thread_ts as threadTs, project_path as projectPath, status,
             created_at as createdAt, ended_at as endedAt, exit_code as exitCode
      FROM sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit) as SessionLogEntry[];
  }

  getSessionMessages(sessionId: string, limit = 100): MessageLogEntry[] {
    const stmt = this.database.prepare(`
      SELECT session_id as sessionId, role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);
    return stmt.all(sessionId, limit) as MessageLogEntry[];
  }
}
