import type { InlineCommand, CommandResult } from './types.js';
import type { SessionManager } from '../session/manager.js';
import { logger } from '../utils/logger.js';
import { SessionExistsError } from '../utils/errors.js';

const log = logger.child({ component: 'commands' });

export function parseInlineCommand(text: string): InlineCommand | null {
  const trimmed = text.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case 'new':
    case 'start':
      return { type: 'new', projectPath: parts[1] };

    case 'stop':
    case 'end':
    case 'exit':
    case 'quit':
      return { type: 'stop' };

    case 'status':
    case 'info':
      return { type: 'status' };

    case 'y':
    case 'yes':
    case 'accept':
      return { type: 'accept' };

    case 'n':
    case 'no':
    case 'reject':
      return { type: 'reject' };

    case 'c':
    case 'cancel':
    case 'ctrl-c':
      return { type: 'cancel' };

    case 'help':
    case 'commands':
      return { type: 'help' };

    default:
      return { type: 'unknown', command: cmd ?? '' };
  }
}

export async function executeCommand(
  command: InlineCommand,
  userId: string,
  userName: string,
  channelId: string,
  messageTs: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  log.debug({ command, userId }, 'Executing command');

  switch (command.type) {
    case 'new':
      return handleNewCommand(command.projectPath, userId, userName, channelId, messageTs, sessionManager);

    case 'stop':
      return handleStopCommand(userId, sessionManager);

    case 'status':
      return handleStatusCommand(userId, sessionManager);

    case 'accept':
      return handleAcceptCommand(userId, sessionManager);

    case 'reject':
      return handleRejectCommand(userId, sessionManager);

    case 'cancel':
      return handleCancelCommand(userId, sessionManager);

    case 'help':
      return handleHelpCommand();

    case 'unknown':
      return {
        text: `Unknown command: \`/${command.command}\`. Use \`/help\` to see available commands.`,
        ephemeral: true,
      };
  }
}

async function handleNewCommand(
  projectPath: string | undefined,
  userId: string,
  userName: string,
  channelId: string,
  messageTs: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  try {
    const session = await sessionManager.createSession({
      userId,
      userName,
      channelId,
      messageTs,
      projectPath,
    });

    return {
      text: `Started new Claude Code session in \`${session.projectPath}\`\nSession ID: \`${session.id}\``,
    };
  } catch (err) {
    if (err instanceof SessionExistsError) {
      const status = await sessionManager.getSessionStatus(userId);
      return {
        text: `You already have an active session.\nSession ID: \`${status.session?.id}\`\nProject: \`${status.session?.projectPath}\`\n\nUse \`/stop\` to end it first.`,
        ephemeral: true,
      };
    }
    log.error({ err, userId }, 'Failed to create session');
    return {
      text: 'Failed to start session. Please try again.',
      ephemeral: true,
    };
  }
}

async function handleStopCommand(
  userId: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const terminated = await sessionManager.terminateSession(userId);

  if (terminated) {
    return { text: 'Session terminated.' };
  }

  return {
    text: 'No active session to stop.',
    ephemeral: true,
  };
}

async function handleStatusCommand(
  userId: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const status = await sessionManager.getSessionStatus(userId);

  if (!status.hasSession) {
    return {
      text: 'No active session. Send a message or use `/new` to start one.',
      ephemeral: true,
    };
  }

  const session = status.session!;
  const uptime = Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000 / 60);

  return {
    text: [
      '*Session Status*',
      `• ID: \`${session.id}\``,
      `• Project: \`${session.projectPath}\``,
      `• Status: ${session.status}`,
      `• Process: ${status.processStatus}`,
      `• Uptime: ${uptime} minutes`,
    ].join('\n'),
    ephemeral: true,
  };
}

async function handleAcceptCommand(
  userId: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const sent = await sessionManager.sendControl(userId, 'y');

  if (sent) {
    return { text: 'Accepted (y)' };
  }

  return {
    text: 'No active session.',
    ephemeral: true,
  };
}

async function handleRejectCommand(
  userId: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const sent = await sessionManager.sendControl(userId, 'n');

  if (sent) {
    return { text: 'Rejected (n)' };
  }

  return {
    text: 'No active session.',
    ephemeral: true,
  };
}

async function handleCancelCommand(
  userId: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const sent = await sessionManager.sendControl(userId, 'ctrl-c');

  if (sent) {
    return { text: 'Sent Ctrl+C' };
  }

  return {
    text: 'No active session.',
    ephemeral: true,
  };
}

function handleHelpCommand(): CommandResult {
  return {
    text: [
      '*ClaudeWire Commands*',
      '',
      '`/new [path]` - Start a new session (optionally in a specific project path)',
      '`/stop` - End your current session',
      '`/status` - Show session status',
      '',
      '*During Tool Prompts:*',
      '`/y` or `/accept` - Accept tool use',
      '`/n` or `/reject` - Reject tool use',
      '`/cancel` - Send Ctrl+C to cancel',
      '',
      '*Or just send a message* - It goes directly to Claude Code',
    ].join('\n'),
    ephemeral: true,
  };
}
