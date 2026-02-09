import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { cleanTerminalOutput, detectToolUsePrompt } from './parser.js';
import { logger } from '../utils/logger.js';
import { ClaudeSpawnError } from '../utils/errors.js';
import type { ClaudeProcessConfig, ClaudeProcessStatus } from './types.js';

const log = logger.child({ component: 'claude-wrapper' });

export interface ClaudeWrapperEvents {
  output: [text: string];
  rawOutput: [data: string];
  toolUsePrompt: [text: string];
  exit: [code: number];
  error: [error: Error];
  ready: [];
}

export class ClaudeCodeWrapper extends EventEmitter<ClaudeWrapperEvents> {
  private pty: pty.IPty | null = null;
  private outputBuffer: string = '';
  private debounceTimer: NodeJS.Timeout | null = null;
  private status: ClaudeProcessStatus = 'starting';
  private readyTimeout: NodeJS.Timeout | null = null;

  readonly sessionId: string;
  readonly projectPath: string;
  private readonly cols: number;
  private readonly rows: number;

  constructor(config: ClaudeProcessConfig) {
    super();
    this.sessionId = config.sessionId;
    this.projectPath = config.projectPath;
    this.cols = config.cols ?? 120;
    this.rows = config.rows ?? 40;
  }

  getStatus(): ClaudeProcessStatus {
    return this.status;
  }

  isAlive(): boolean {
    return this.pty !== null && this.status !== 'terminated';
  }

  async spawn(): Promise<void> {
    if (this.pty) {
      throw new ClaudeSpawnError('Process already spawned');
    }

    log.info({ sessionId: this.sessionId, projectPath: this.projectPath }, 'Spawning Claude Code');

    try {
      this.pty = pty.spawn('claude', [], {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: this.projectPath,
        env: {
          ...process.env,
          CLAUDE_CODE_ENTRY_POINT: 'claudewire',
          TERM: 'xterm-256color',
          // Disable pager for cleaner output
          PAGER: '',
          GIT_PAGER: '',
        },
      });

      this.pty.onData((data: string) => {
        this.handleRawOutput(data);
      });

      this.pty.onExit(({ exitCode }) => {
        this.handleExit(exitCode);
      });

      // Set ready after a short delay (Claude Code startup)
      this.readyTimeout = setTimeout(() => {
        if (this.status === 'starting') {
          this.status = 'ready';
          this.emit('ready');
          log.info({ sessionId: this.sessionId }, 'Claude Code ready');
        }
      }, 2000);

    } catch (err) {
      this.status = 'terminated';
      throw new ClaudeSpawnError((err as Error).message, err as Error);
    }
  }

  private handleRawOutput(data: string): void {
    this.emit('rawOutput', data);
    this.outputBuffer += data;

    // Check for tool use prompts immediately
    if (detectToolUsePrompt(this.outputBuffer)) {
      this.emit('toolUsePrompt', this.outputBuffer);
    }

    // Debounce cleaned output emission
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.outputBuffer.trim()) {
        const cleaned = cleanTerminalOutput(this.outputBuffer);
        if (cleaned) {
          this.emit('output', cleaned);
        }
        this.outputBuffer = '';
      }
    }, 150);
  }

  private handleExit(exitCode: number): void {
    log.info({ sessionId: this.sessionId, exitCode }, 'Claude Code exited');

    this.status = 'terminated';

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }

    // Flush any remaining output
    if (this.outputBuffer.trim()) {
      const cleaned = cleanTerminalOutput(this.outputBuffer);
      if (cleaned) {
        this.emit('output', cleaned);
      }
      this.outputBuffer = '';
    }

    this.emit('exit', exitCode);
    this.pty = null;
  }

  sendInput(text: string): void {
    if (!this.pty || this.status === 'terminated') {
      log.warn({ sessionId: this.sessionId }, 'Attempted to send input to dead process');
      return;
    }

    log.debug({ sessionId: this.sessionId, inputLength: text.length }, 'Sending input');
    this.status = 'busy';
    this.pty.write(text + '\n');
  }

  sendControl(key: 'y' | 'n' | 'escape' | 'ctrl-c'): void {
    if (!this.pty || this.status === 'terminated') {
      return;
    }

    log.debug({ sessionId: this.sessionId, key }, 'Sending control key');

    switch (key) {
      case 'y':
        this.pty.write('y');
        break;
      case 'n':
        this.pty.write('n');
        break;
      case 'escape':
        this.pty.write('\x1b');
        break;
      case 'ctrl-c':
        this.pty.write('\x03');
        break;
    }
  }

  async terminate(): Promise<void> {
    if (!this.pty) {
      return;
    }

    log.info({ sessionId: this.sessionId }, 'Terminating Claude Code');

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }

    // Try graceful exit first
    this.pty.write('\x03'); // Ctrl+C
    this.pty.write('/exit\n');

    // Force kill after a short delay
    await new Promise<void>((resolve) => {
      const forceKillTimeout = setTimeout(() => {
        if (this.pty) {
          this.pty.kill();
          this.pty = null;
        }
        this.status = 'terminated';
        resolve();
      }, 1000);

      // If it exits naturally, clear the force kill
      this.once('exit', () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });
    });
  }

  resize(cols: number, rows: number): void {
    if (this.pty) {
      this.pty.resize(cols, rows);
    }
  }
}
