import { execSync } from 'child_process';
import { logger } from './logger.js';

const log = logger.child({ component: 'system' });

let claudeCodeAvailable: boolean | null = null;

export function isClaudeCodeInstalled(): boolean {
  if (claudeCodeAvailable !== null) {
    return claudeCodeAvailable;
  }

  try {
    execSync('which claude', { stdio: 'ignore' });
    claudeCodeAvailable = true;
    log.info('Claude Code CLI is available');
  } catch {
    claudeCodeAvailable = false;
    log.error('Claude Code CLI is not installed. Please install it from https://docs.anthropic.com/en/docs/claude-code');
  }

  return claudeCodeAvailable;
}

export function getClaudeCodeVersion(): string | null {
  try {
    const version = execSync('claude --version', { encoding: 'utf-8' }).trim();
    return version;
  } catch {
    return null;
  }
}
