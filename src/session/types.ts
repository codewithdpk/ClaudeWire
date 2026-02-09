export type SessionStatus = 'starting' | 'active' | 'waiting_input' | 'terminated';

export interface Session {
  id: string;

  // User binding (private per user)
  userId: string;
  userName: string;

  // Context
  channelId: string;
  threadTs: string;
  projectPath: string;

  // State
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
}

export interface CreateSessionOptions {
  userId: string;
  userName: string;
  channelId: string;
  messageTs: string;
  projectPath?: string;
}

export interface SessionOutput {
  session: Session;
  text: string;
}

export interface SessionManagerEvents {
  output: [data: SessionOutput];
  sessionCreated: [session: Session];
  sessionTerminated: [sessionId: string, exitCode: number];
  toolUsePrompt: [session: Session, text: string];
}
