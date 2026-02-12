export class ClaudeWireError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClaudeWireError';
  }
}

export class SessionExistsError extends ClaudeWireError {
  constructor(existingSessionId: string) {
    super(
      'User already has an active session',
      'SESSION_EXISTS',
      { existingSessionId }
    );
    this.name = 'SessionExistsError';
  }
}

export class NoSessionError extends ClaudeWireError {
  constructor(userId?: string) {
    super(
      'No active session found',
      'NO_SESSION',
      { userId }
    );
    this.name = 'NoSessionError';
  }
}

export class SessionTerminatedError extends ClaudeWireError {
  constructor(sessionId: string) {
    super(
      'Session has been terminated',
      'SESSION_TERMINATED',
      { sessionId }
    );
    this.name = 'SessionTerminatedError';
  }
}

export class UnauthorizedError extends ClaudeWireError {
  constructor(userId: string) {
    super(
      'User is not authorized to use ClaudeWire',
      'UNAUTHORIZED',
      { userId }
    );
    this.name = 'UnauthorizedError';
  }
}

export class ClaudeSpawnError extends ClaudeWireError {
  constructor(message: string, cause?: Error) {
    super(
      `Failed to spawn Claude Code: ${message}`,
      'CLAUDE_SPAWN_ERROR',
      { cause: cause?.message }
    );
    this.name = 'ClaudeSpawnError';
  }
}

export class ClaudeCodeNotInstalledError extends ClaudeWireError {
  constructor() {
    super(
      'Claude Code CLI is not installed on this system',
      'CLAUDE_CODE_NOT_INSTALLED',
      { installUrl: 'https://docs.anthropic.com/en/docs/claude-code' }
    );
    this.name = 'ClaudeCodeNotInstalledError';
  }
}

export class StorageError extends ClaudeWireError {
  constructor(operation: string, cause?: Error) {
    super(
      `Storage operation failed: ${operation}`,
      'STORAGE_ERROR',
      { operation, cause: cause?.message }
    );
    this.name = 'StorageError';
  }
}
