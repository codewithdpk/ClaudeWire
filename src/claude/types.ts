import type { IPty } from 'node-pty';

export interface ClaudeProcessConfig {
  sessionId: string;
  projectPath: string;
  cols?: number;
  rows?: number;
}

export interface ClaudeProcessEvents {
  output: (text: string) => void;
  rawOutput: (data: string) => void;
  exit: (code: number) => void;
  error: (error: Error) => void;
  ready: () => void;
}

export type ClaudeProcessStatus = 'starting' | 'ready' | 'busy' | 'terminated';

export interface ClaudeProcess {
  sessionId: string;
  pty: IPty | null;
  workingDir: string;
  status: ClaudeProcessStatus;

  sendInput(text: string): void;
  sendControl(key: 'y' | 'n' | 'escape' | 'ctrl-c'): void;
  terminate(): Promise<void>;
  isAlive(): boolean;
}
