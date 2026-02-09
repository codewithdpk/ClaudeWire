import type { WebClient } from '@slack/web-api';
import type { SlackContext } from './types.js';
import type { SessionManager } from '../session/manager.js';
import type { AuthService } from '../gateway/auth.js';
import { parseInlineCommand, executeCommand } from './commands.js';
import { ThreadStreamer } from '../streaming/thread-streamer.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ component: 'slack-handlers' });

// Map of session IDs to their thread streamers
const activeStreamers = new Map<string, ThreadStreamer>();

export async function handleUserMessage(
  ctx: SlackContext,
  text: string,
  client: WebClient,
  sessionManager: SessionManager,
  authService: AuthService
): Promise<void> {
  // Check authorization
  if (!authService.isAllowed(ctx.userId)) {
    await client.chat.postMessage({
      channel: ctx.channelId,
      thread_ts: ctx.messageTs,
      text: 'You are not authorized to use ClaudeWire. Contact an admin to get access.',
    });
    return;
  }

  // Check for inline commands
  const command = parseInlineCommand(text);
  if (command) {
    const result = await executeCommand(
      command,
      ctx.userId,
      ctx.userName,
      ctx.channelId,
      ctx.messageTs,
      sessionManager
    );

    await client.chat.postMessage({
      channel: ctx.channelId,
      thread_ts: ctx.messageTs,
      text: result.text,
    });
    return;
  }

  // Get or create session
  let session = await sessionManager.getSessionForUser(ctx.userId);

  if (!session) {
    // Auto-create session on first message
    try {
      session = await sessionManager.createSession({
        userId: ctx.userId,
        userName: ctx.userName,
        channelId: ctx.channelId,
        messageTs: ctx.messageTs,
      });

      await client.chat.postMessage({
        channel: ctx.channelId,
        thread_ts: ctx.messageTs,
        text: `Started new Claude Code session in \`${session.projectPath}\``,
      });
    } catch (err) {
      log.error({ err, userId: ctx.userId }, 'Failed to create session');
      await client.chat.postMessage({
        channel: ctx.channelId,
        thread_ts: ctx.messageTs,
        text: 'Failed to start session. Please try again.',
      });
      return;
    }
  }

  // Create or get streamer for this session
  let streamer = activeStreamers.get(session.id);
  if (!streamer || ctx.threadTs !== session.threadTs) {
    // Create new streamer for the correct thread
    streamer = new ThreadStreamer(client, ctx.channelId, session.threadTs);
    activeStreamers.set(session.id, streamer);
  }

  // Send input to Claude Code
  try {
    await sessionManager.sendInput(ctx.userId, text);
  } catch (err) {
    log.error({ err, userId: ctx.userId }, 'Failed to send input');
    await client.chat.postMessage({
      channel: ctx.channelId,
      thread_ts: ctx.messageTs,
      text: 'Failed to send message to Claude Code. Your session may have ended.',
    });
  }
}

export async function handleSlashCommand(
  commandText: string,
  userId: string,
  userName: string,
  channelId: string,
  _client: WebClient,
  sessionManager: SessionManager
): Promise<string> {
  const parts = commandText.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() || 'help';

  log.debug({ subcommand, userId }, 'Handling slash command');

  switch (subcommand) {
    case 'new':
    case 'start': {
      const projectPath = parts[1];
      // Generate a unique messageTs for the thread
      const messageTs = Date.now().toString();
      const result = await executeCommand(
        { type: 'new', projectPath },
        userId,
        userName,
        channelId,
        messageTs,
        sessionManager
      );
      return result.text;
    }

    case 'stop':
    case 'end': {
      const result = await executeCommand(
        { type: 'stop' },
        userId,
        userName,
        channelId,
        '',
        sessionManager
      );
      return result.text;
    }

    case 'status':
    case 'info': {
      const result = await executeCommand(
        { type: 'status' },
        userId,
        userName,
        channelId,
        '',
        sessionManager
      );
      return result.text;
    }

    case 'help':
    default: {
      const result = await executeCommand(
        { type: 'help' },
        userId,
        userName,
        channelId,
        '',
        sessionManager
      );
      return result.text;
    }
  }
}

export function setupSessionOutputHandler(
  sessionManager: SessionManager,
  client: WebClient
): void {
  sessionManager.on('output', async ({ session, text }) => {
    let streamer = activeStreamers.get(session.id);

    if (!streamer) {
      streamer = new ThreadStreamer(client, session.channelId, session.threadTs);
      activeStreamers.set(session.id, streamer);
    }

    await streamer.append(text);
  });

  sessionManager.on('toolUsePrompt', async (session, text) => {
    const streamer = activeStreamers.get(session.id);
    if (streamer) {
      await streamer.sendImmediate(
        `${text}\n\n_Reply with \`/y\` to accept or \`/n\` to reject_`
      );
    }
  });

  sessionManager.on('sessionTerminated', async (sessionId, exitCode) => {
    const streamer = activeStreamers.get(sessionId);
    if (streamer) {
      await streamer.finalize(`Session ended (exit code: ${exitCode})`);
      activeStreamers.delete(sessionId);
    }
  });
}

export function cleanupStreamer(sessionId: string): void {
  const streamer = activeStreamers.get(sessionId);
  if (streamer) {
    streamer.reset();
    activeStreamers.delete(sessionId);
  }
}
