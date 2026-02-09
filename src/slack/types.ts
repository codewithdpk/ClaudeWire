import type { WebClient } from '@slack/web-api';

export interface SlackContext {
  userId: string;
  userName: string;
  channelId: string;
  threadTs?: string;
  messageTs: string;
}

export interface SlackDependencies {
  client: WebClient;
}

export interface CommandResult {
  text: string;
  ephemeral?: boolean;
  blocks?: unknown[];
}

export type InlineCommand =
  | { type: 'new'; projectPath?: string }
  | { type: 'stop' }
  | { type: 'status' }
  | { type: 'accept' }
  | { type: 'reject' }
  | { type: 'cancel' }
  | { type: 'help' }
  | { type: 'unknown'; command: string };
