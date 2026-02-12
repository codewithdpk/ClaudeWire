import type { InlineCommand, CommandResult } from './types.js';
import type { SessionManager } from '../session/manager.js';
import { ProjectManager } from '../storage/projects.js';
import { logger } from '../utils/logger.js';
import { SessionExistsError, ClaudeCodeNotInstalledError } from '../utils/errors.js';
import path from 'path';

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

    case 'projects':
    case 'list':
    case 'ls':
      return { type: 'projects' };

    case 'sessions':
    case 'active':
      return { type: 'sessions' };

    case 'resume':
    case 'open':
      return { type: 'resume', projectName: parts[1] };

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
  sessionManager: SessionManager,
  projectManager?: ProjectManager
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

    case 'projects':
      return handleProjectsCommand(userId, projectManager);

    case 'sessions':
      return handleSessionsCommand(userId, sessionManager);

    case 'resume':
      return handleResumeCommand(command.projectName, userId, userName, channelId, messageTs, sessionManager, projectManager);

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
    if (err instanceof ClaudeCodeNotInstalledError) {
      return {
        text: '*Error: Claude Code CLI is not installed*\n\nClaudeWire requires Claude Code to be installed on the server.\nPlease contact your administrator or visit: https://docs.anthropic.com/en/docs/claude-code',
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
      '*Session Management:*',
      '`/new [name]` - Start a new session (optionally with project name)',
      '`/stop` - End your current session',
      '`/status` - Show session status',
      '',
      '*Project Management:*',
      '`/projects` - List your available projects',
      '`/resume <name>` - Resume session in an existing project',
      '`/sessions` - Show your active sessions',
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

function handleProjectsCommand(
  userId: string,
  projectManager?: ProjectManager
): CommandResult {
  if (!projectManager) {
    return {
      text: 'Project manager not available.',
      ephemeral: true,
    };
  }

  const projects = projectManager.listUserProjects(userId);

  if (projects.length === 0) {
    return {
      text: '*Your Projects*\n\nNo projects found. Use `/new <project-name>` to create one.',
      ephemeral: true,
    };
  }

  const projectList = projects.map((p) => {
    const name = path.basename(p);
    const info = projectManager.getProjectInfo(p);
    const gitBadge = info.hasGit ? ' :git:' : '';
    return `• \`${name}\`${gitBadge} (${info.fileCount} items)`;
  });

  return {
    text: [
      '*Your Projects*',
      '',
      ...projectList,
      '',
      'Use `/resume <name>` to start a session in a project.',
    ].join('\n'),
    ephemeral: true,
  };
}

async function handleSessionsCommand(
  userId: string,
  sessionManager: SessionManager
): Promise<CommandResult> {
  const status = await sessionManager.getSessionStatus(userId);

  if (!status.hasSession) {
    return {
      text: '*Active Sessions*\n\nNo active sessions. Use `/new` to start one.',
      ephemeral: true,
    };
  }

  const session = status.session!;
  const projectName = path.basename(session.projectPath);
  const uptime = Math.round((Date.now() - new Date(session.createdAt).getTime()) / 1000 / 60);

  return {
    text: [
      '*Active Sessions*',
      '',
      `• *${projectName}*`,
      `  - Session ID: \`${session.id}\``,
      `  - Status: ${session.status}`,
      `  - Uptime: ${uptime} minutes`,
      `  - Path: \`${session.projectPath}\``,
    ].join('\n'),
    ephemeral: true,
  };
}

async function handleResumeCommand(
  projectName: string | undefined,
  userId: string,
  userName: string,
  channelId: string,
  messageTs: string,
  sessionManager: SessionManager,
  projectManager?: ProjectManager
): Promise<CommandResult> {
  if (!projectName) {
    return {
      text: 'Please specify a project name: `/resume <project-name>`\n\nUse `/projects` to see available projects.',
      ephemeral: true,
    };
  }

  if (!projectManager) {
    return {
      text: 'Project manager not available.',
      ephemeral: true,
    };
  }

  // Find the project by name
  const projects = projectManager.listUserProjects(userId);
  const matchingProject = projects.find((p) => path.basename(p) === projectName);

  if (!matchingProject) {
    return {
      text: `Project \`${projectName}\` not found.\n\nUse \`/projects\` to see available projects or \`/new ${projectName}\` to create it.`,
      ephemeral: true,
    };
  }

  // Start session in the existing project
  try {
    const session = await sessionManager.createSession({
      userId,
      userName,
      channelId,
      messageTs,
      projectPath: matchingProject,
    });

    return {
      text: `Resumed session in \`${projectName}\`\nSession ID: \`${session.id}\`\nPath: \`${session.projectPath}\``,
    };
  } catch (err) {
    if (err instanceof SessionExistsError) {
      const status = await sessionManager.getSessionStatus(userId);
      return {
        text: `You already have an active session in \`${path.basename(status.session?.projectPath ?? '')}\`.\n\nUse \`/stop\` to end it first.`,
        ephemeral: true,
      };
    }
    if (err instanceof ClaudeCodeNotInstalledError) {
      return {
        text: '*Error: Claude Code CLI is not installed*\n\nClaudeWire requires Claude Code to be installed on the server.',
        ephemeral: true,
      };
    }
    log.error({ err, userId, projectName }, 'Failed to resume session');
    return {
      text: 'Failed to resume session. Please try again.',
      ephemeral: true,
    };
  }
}
