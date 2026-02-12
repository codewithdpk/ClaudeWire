import pkg from '@slack/bolt';
import type { App as AppType, GenericMessageEvent } from '@slack/bolt';

const { App, LogLevel } = pkg;
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { SessionManager } from '../session/manager.js';
import type { AuthService } from '../gateway/auth.js';
import {
  handleUserMessage,
  handleSlashCommand,
  setupSessionOutputHandler,
} from './handlers.js';

const log = logger.child({ component: 'slack-bot' });

export function createSlackBot(
  sessionManager: SessionManager,
  authService: AuthService
): AppType {
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
    logLevel: config.logging.level === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
  });

  // Set up session output handler
  setupSessionOutputHandler(sessionManager, app.client);

  // Handle direct messages
  app.event('message', async ({ event, client }) => {
    // Type guard for generic messages
    const msg = event as GenericMessageEvent;

    // Ignore bot messages, message changes, etc.
    if (msg.subtype || msg.bot_id) return;

    // Only process if there's text
    if (!msg.text) return;

    // Get user info for display name
    let userName = msg.user;
    try {
      const userInfo = await client.users.info({ user: msg.user });
      userName = userInfo.user?.real_name || userInfo.user?.name || msg.user;
    } catch {
      // Use user ID if we can't get info
    }

    log.debug({
      userId: msg.user,
      channelId: msg.channel,
      hasThread: !!msg.thread_ts,
    }, 'Received message');

    await handleUserMessage(
      {
        userId: msg.user,
        userName,
        channelId: msg.channel,
        threadTs: msg.thread_ts,
        messageTs: msg.ts,
      },
      msg.text,
      client,
      sessionManager,
      authService
    );
  });

  // Handle app mentions
  app.event('app_mention', async ({ event, client }) => {
    // Skip if no user (shouldn't happen but type safety)
    if (!event.user) return;

    const userId = event.user;

    // Get user info
    let userName: string = userId;
    try {
      const userInfo = await client.users.info({ user: userId });
      userName = userInfo.user?.real_name ?? userInfo.user?.name ?? userId;
    } catch {
      // Use user ID if we can't get info
    }

    // Remove the mention from the text
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (!text) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: 'Hello! Send me a message to start a Claude Code session. Use `/help` for commands.',
      });
      return;
    }

    log.debug({
      userId,
      channelId: event.channel,
    }, 'Received app mention');

    await handleUserMessage(
      {
        userId,
        userName,
        channelId: event.channel,
        threadTs: event.thread_ts,
        messageTs: event.ts,
      },
      text,
      client,
      sessionManager,
      authService
    );
  });

  // Handle /claude slash command
  app.command('/claude', async ({ command, ack, respond }) => {
    await ack();

    log.debug({
      userId: command.user_id,
      subcommand: command.text,
    }, 'Received slash command');

    const response = await handleSlashCommand(
      command.text,
      command.user_id,
      command.user_name,
      command.channel_id,
      app.client,
      sessionManager
    );

    await respond({
      text: response,
      response_type: 'ephemeral',
    });
  });

  // Error handler
  app.error(async (error) => {
    log.error({ err: error }, 'Slack app error');
  });

  return app;
}

export async function startSlackBot(app: AppType): Promise<void> {
  await app.start();
  log.info('Slack bot started in Socket Mode');
}

export async function stopSlackBot(app: AppType): Promise<void> {
  await app.stop();
  log.info('Slack bot stopped');
}
