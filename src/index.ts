import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { getRedisClient, closeRedis, RedisSessionStore } from './storage/redis.js';
import { getDatabase, closeDatabase, SQLiteLogger } from './storage/sqlite.js';
import { ProjectManager } from './storage/projects.js';
import { SessionManager } from './session/manager.js';
import { AuthService } from './gateway/auth.js';
import { createSlackBot, startSlackBot, stopSlackBot } from './slack/bot.js';
import type { App } from '@slack/bolt';

const log = logger.child({ component: 'main' });

let slackApp: App | null = null;
let sessionManager: SessionManager | null = null;
let isShuttingDown = false;

async function main(): Promise<void> {
  log.info({ version: '1.0.0' }, 'Starting ClaudeWire');

  try {
    // Initialize storage
    log.info('Initializing storage...');
    const redis = await getRedisClient();
    const db = getDatabase();

    // Create services
    const redisStore = new RedisSessionStore(redis);
    const sqliteLogger = new SQLiteLogger(db);
    const projectManager = new ProjectManager();
    const authService = new AuthService();

    // Create session manager
    sessionManager = new SessionManager(redisStore, sqliteLogger, projectManager);

    // Create and start Slack bot
    log.info('Starting Slack bot...');
    slackApp = createSlackBot(sessionManager, authService, projectManager);
    await startSlackBot(slackApp);

    log.info('ClaudeWire is running!');
    log.info({
      projectsDir: config.claude.projectsDir,
      sessionTimeout: `${config.claude.sessionTimeoutMinutes} minutes`,
      allowAll: config.auth.allowAll,
      allowedUsers: config.auth.allowedUserIds.length,
    }, 'Configuration');

  } catch (err) {
    log.fatal({ err }, 'Failed to start ClaudeWire');
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info({ signal }, 'Shutting down...');

  try {
    // Stop Slack bot
    if (slackApp) {
      await stopSlackBot(slackApp);
    }

    // Shutdown session manager (terminates all Claude processes)
    if (sessionManager) {
      await sessionManager.shutdown();
    }

    // Close storage connections
    await closeRedis();
    closeDatabase();

    log.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  log.fatal({ reason }, 'Unhandled rejection');
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

// Start the application
main().catch((err) => {
  log.fatal({ err }, 'Failed to start');
  process.exit(1);
});
