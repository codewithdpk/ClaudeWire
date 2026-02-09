import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { ClaudeCodeWrapper } from '../claude/wrapper.js';
import { RedisSessionStore } from '../storage/redis.js';
import { SQLiteLogger } from '../storage/sqlite.js';
import { ProjectManager } from '../storage/projects.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { SessionExistsError, NoSessionError } from '../utils/errors.js';
import type {
  Session,
  CreateSessionOptions,
  SessionManagerEvents,
} from './types.js';

const log = logger.child({ component: 'session-manager' });

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private claudeProcesses: Map<string, ClaudeCodeWrapper> = new Map();
  private sessionTimeoutTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private redisStore: RedisSessionStore,
    private sqliteLogger: SQLiteLogger,
    private projectManager: ProjectManager
  ) {
    super();
  }

  async getSessionForUser(userId: string): Promise<Session | null> {
    const sessionId = await this.redisStore.getSessionIdForUser(userId);
    if (!sessionId) return null;

    const session = await this.redisStore.getSession<Session>(sessionId);
    if (!session) return null;

    // Check if process is still alive
    const process = this.claudeProcesses.get(sessionId);
    if (!process || !process.isAlive()) {
      // Clean up dead session
      await this.cleanupSession(sessionId, userId);
      return null;
    }

    return session;
  }

  async createSession(opts: CreateSessionOptions): Promise<Session> {
    // Check for existing session
    const existing = await this.getSessionForUser(opts.userId);
    if (existing) {
      throw new SessionExistsError(existing.id);
    }

    // Determine project path
    let projectPath: string;
    if (opts.projectPath) {
      const validated = this.projectManager.validateProjectPath(opts.projectPath, opts.userId);
      if (!validated) {
        // Fall back to user's default directory
        projectPath = this.projectManager.getUserProjectDir(opts.userId);
        log.warn({ userId: opts.userId, requestedPath: opts.projectPath }, 'Invalid project path, using default');
      } else {
        projectPath = validated;
      }
    } else {
      projectPath = this.projectManager.getUserProjectDir(opts.userId);
    }

    const session: Session = {
      id: nanoid(),
      userId: opts.userId,
      userName: opts.userName,
      channelId: opts.channelId,
      threadTs: opts.messageTs,
      projectPath,
      status: 'starting',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    log.info({ sessionId: session.id, userId: opts.userId, projectPath }, 'Creating session');

    // Spawn Claude Code process
    const claude = new ClaudeCodeWrapper({
      sessionId: session.id,
      projectPath: session.projectPath,
    });

    // Wire up events before spawning
    claude.on('output', (text) => {
      this.handleOutput(session, text);
    });

    claude.on('toolUsePrompt', (text) => {
      this.updateSessionStatus(session.id, 'waiting_input');
      this.emit('toolUsePrompt', session, text);
    });

    claude.on('exit', (code) => {
      this.handleProcessExit(session.id, opts.userId, code);
    });

    claude.on('ready', () => {
      this.updateSessionStatus(session.id, 'active');
    });

    try {
      await claude.spawn();
    } catch (err) {
      log.error({ err, sessionId: session.id }, 'Failed to spawn Claude Code');
      throw err;
    }

    // Store session
    const ttlSeconds = config.claude.sessionTimeoutMinutes * 60;
    await this.redisStore.setSession(session.id, opts.userId, session, ttlSeconds);
    this.claudeProcesses.set(session.id, claude);

    // Log to SQLite
    this.sqliteLogger.logSessionStart({
      id: session.id,
      userId: session.userId,
      userName: session.userName,
      channelId: session.channelId,
      threadTs: session.threadTs,
      projectPath: session.projectPath,
    });

    // Set up session timeout
    this.resetSessionTimeout(session.id, opts.userId);

    session.status = 'active';
    this.emit('sessionCreated', session);

    return session;
  }

  async sendInput(userId: string, text: string): Promise<void> {
    const session = await this.getSessionForUser(userId);
    if (!session) {
      throw new NoSessionError(userId);
    }

    const claude = this.claudeProcesses.get(session.id);
    if (!claude || !claude.isAlive()) {
      throw new NoSessionError(userId);
    }

    log.debug({ sessionId: session.id, inputLength: text.length }, 'Sending input to Claude');

    claude.sendInput(text);

    // Update activity timestamp
    session.lastActivityAt = new Date().toISOString();
    session.status = 'active';
    await this.redisStore.setSession(
      session.id,
      userId,
      session,
      config.claude.sessionTimeoutMinutes * 60
    );

    // Log message
    this.sqliteLogger.logMessage(session.id, 'user', text);

    // Reset timeout
    this.resetSessionTimeout(session.id, userId);
  }

  async sendControl(userId: string, key: 'y' | 'n' | 'escape' | 'ctrl-c'): Promise<boolean> {
    const session = await this.getSessionForUser(userId);
    if (!session) return false;

    const claude = this.claudeProcesses.get(session.id);
    if (!claude || !claude.isAlive()) return false;

    log.debug({ sessionId: session.id, key }, 'Sending control key');
    claude.sendControl(key);

    // Update activity
    session.lastActivityAt = new Date().toISOString();
    if (key === 'y' || key === 'n') {
      session.status = 'active';
    }
    await this.redisStore.setSession(
      session.id,
      userId,
      session,
      config.claude.sessionTimeoutMinutes * 60
    );

    this.resetSessionTimeout(session.id, userId);
    return true;
  }

  async terminateSession(userId: string): Promise<boolean> {
    const session = await this.getSessionForUser(userId);
    if (!session) return false;

    log.info({ sessionId: session.id, userId }, 'Terminating session');

    const claude = this.claudeProcesses.get(session.id);
    if (claude) {
      await claude.terminate();
    }

    await this.cleanupSession(session.id, userId);
    return true;
  }

  async getSessionStatus(userId: string): Promise<{
    hasSession: boolean;
    session?: Session;
    processStatus?: string;
  }> {
    const session = await this.getSessionForUser(userId);
    if (!session) {
      return { hasSession: false };
    }

    const claude = this.claudeProcesses.get(session.id);
    return {
      hasSession: true,
      session,
      processStatus: claude?.getStatus() ?? 'unknown',
    };
  }

  private handleOutput(session: Session, text: string): void {
    // Log Claude's output
    this.sqliteLogger.logMessage(session.id, 'claude', text);

    // Emit for Slack streaming
    this.emit('output', { session, text });
  }

  private async handleProcessExit(sessionId: string, userId: string, exitCode: number): Promise<void> {
    log.info({ sessionId, exitCode }, 'Claude process exited');

    this.sqliteLogger.logSessionEnd(sessionId, exitCode);
    await this.cleanupSession(sessionId, userId);

    this.emit('sessionTerminated', sessionId, exitCode);
  }

  private async cleanupSession(sessionId: string, userId: string): Promise<void> {
    // Clear timeout
    const timeout = this.sessionTimeoutTimers.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeoutTimers.delete(sessionId);
    }

    // Remove process reference
    this.claudeProcesses.delete(sessionId);

    // Delete from Redis
    await this.redisStore.deleteSession(sessionId, userId);
  }

  private async updateSessionStatus(sessionId: string, status: Session['status']): Promise<void> {
    const session = await this.redisStore.getSession<Session>(sessionId);
    if (session) {
      session.status = status;
      session.lastActivityAt = new Date().toISOString();
      await this.redisStore.setSession(
        sessionId,
        session.userId,
        session,
        config.claude.sessionTimeoutMinutes * 60
      );
    }
  }

  private resetSessionTimeout(sessionId: string, userId: string): void {
    // Clear existing timeout
    const existing = this.sessionTimeoutTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeoutMs = config.claude.sessionTimeoutMinutes * 60 * 1000;
    const timeout = setTimeout(async () => {
      log.info({ sessionId }, 'Session timed out');
      const session = await this.redisStore.getSession<Session>(sessionId);
      if (session) {
        await this.terminateSession(userId);
      }
    }, timeoutMs);

    this.sessionTimeoutTimers.set(sessionId, timeout);
  }

  async shutdown(): Promise<void> {
    log.info('Shutting down session manager');

    // Clear all timeouts
    for (const timeout of this.sessionTimeoutTimers.values()) {
      clearTimeout(timeout);
    }
    this.sessionTimeoutTimers.clear();

    // Terminate all processes
    const terminatePromises: Promise<void>[] = [];
    for (const [sessionId, claude] of this.claudeProcesses) {
      log.debug({ sessionId }, 'Terminating process during shutdown');
      terminatePromises.push(claude.terminate());
    }

    await Promise.allSettled(terminatePromises);
    this.claudeProcesses.clear();
  }
}
