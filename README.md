# ClaudeWire

**Bridge Claude Code to Slack** — Control your AI coding assistant from anywhere.

ClaudeWire turns Slack into a command center for [Claude Code](https://claude.ai/claude-code), Anthropic's agentic coding tool. Run coding tasks on a remote VM, stream output in real-time, and collaborate with your team — all from Slack.

## Why ClaudeWire?

- **Remote Access**: Run Claude Code on a powerful VM from your phone or any device with Slack
- **Team Collaboration**: Share coding sessions in Slack channels with threaded conversations
- **Always On**: Keep long-running tasks going without tying up your local machine
- **Secure**: User allowlisting, isolated project directories, and audit logging

## Features

- **Private Sessions**: Each user gets their own isolated Claude Code session
- **Thread-Based Output**: All output streams to Slack threads, keeping channels clean
- **Real-Time Streaming**: See Claude's work as it happens with debounced updates
- **Full CLI Control**: Accept/reject tool use, cancel operations, manage sessions
- **Session Persistence**: Redis for state, SQLite for history and audit logs
- **Socket Mode**: No public URLs needed — works behind firewalls

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Your VM                                         │
│                                                                              │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │     ClaudeWire      │────▶│       Redis         │                        │
│  │     (Node.js)       │     │   (Session State)   │                        │
│  │                     │     └─────────────────────┘                        │
│  │  • Slack Bot        │     ┌─────────────────────┐                        │
│  │  • Session Manager  │     │      SQLite         │                        │
│  │  • Output Streamer  │     │  (History/Logs)     │                        │
│  └──────────┬──────────┘     └─────────────────────┘                        │
│             │ spawns                                                         │
│             ▼                                                                │
│  ┌─────────────────────┐     ┌─────────────────────┐                        │
│  │  Claude Code (PTY)  │────▶│  /projects/{user}   │                        │
│  │  One per user       │     │  Isolated dirs      │                        │
│  └─────────────────────┘     └─────────────────────┘                        │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ WebSocket (outbound)
                                   ▼
                          ┌─────────────────┐
                          │   Slack API     │
                          └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Redis
- Claude Code CLI installed and authenticated
- Slack workspace with admin access

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** in Settings → Socket Mode
3. Add these **Bot Token Scopes** under OAuth & Permissions:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
   - `users:read`
4. Enable **Events** and subscribe to:
   - `app_mention`
   - `message.im`
5. Add a **Slash Command**: `/claude`
6. Install the app to your workspace
7. Copy your tokens:
   - **Bot User OAuth Token** (`xoxb-...`)
   - **Signing Secret**
   - **App-Level Token** (`xapp-...`) — generate one with `connections:write` scope

### 2. Install ClaudeWire

```bash
git clone https://github.com/your-org/claudewire.git
cd claudewire
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Slack (required)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# Authorization (required) - Slack user IDs
ALLOWED_USER_IDS=U01234567,U89012345
ADMIN_USER_IDS=U01234567

# Optional settings
PROJECTS_DIR=./projects
SESSION_TIMEOUT_MINUTES=60
LOG_LEVEL=info
```

> **Tip**: Find your Slack user ID by clicking your profile → More → Copy member ID

### 4. Run

**Development:**
```bash
npm run dev
```

**Production with Docker:**
```bash
docker-compose up -d
```

## Usage

### Starting a Session

Just DM the bot or mention it in a channel:

```
@ClaudeWire create a Python script that fetches weather data
```

ClaudeWire automatically creates a session and starts working.

### Commands

Use these commands in chat (prefix with `/`):

| Command | Description |
|---------|-------------|
| `/new [path]` | Start a new session (optionally in a specific directory) |
| `/stop` | End your current session |
| `/status` | Show session info |
| `/y` or `/accept` | Accept a tool use prompt |
| `/n` or `/reject` | Reject a tool use prompt |
| `/cancel` | Send Ctrl+C to cancel current operation |
| `/help` | Show all commands |

### Slash Command

Use `/claude` for quick actions:

```
/claude status
/claude new /path/to/project
/claude stop
```

### Example Workflow

1. **Start a session:**
   ```
   @ClaudeWire I need to build a REST API with Express
   ```

2. **Claude creates files and asks for permission:**
   ```
   Claude: I'll create the project structure. Allow Write tool?
   ```

3. **Approve with `/y`:**
   ```
   /y
   ```

4. **Continue the conversation in the thread:**
   ```
   Now add authentication with JWT
   ```

5. **When done:**
   ```
   /stop
   ```

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | (required) | Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | (required) | Signing Secret |
| `SLACK_APP_TOKEN` | (required) | App-Level Token for Socket Mode |
| `ALLOWED_USER_IDS` | `[]` | Comma-separated Slack user IDs |
| `ADMIN_USER_IDS` | `[]` | Admin user IDs |
| `ALLOW_ALL_USERS` | `false` | Allow any user (not recommended) |
| `PROJECTS_DIR` | `./projects` | Base directory for user projects |
| `MAX_SESSIONS_PER_USER` | `1` | Concurrent sessions per user |
| `SESSION_TIMEOUT_MINUTES` | `60` | Auto-terminate inactive sessions |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `SQLITE_PATH` | `./data/claudewire.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

## Development

### Project Structure

```
src/
├── index.ts              # Application entry point
├── config/               # Configuration with Zod validation
├── slack/                # Slack bot, handlers, commands
├── gateway/              # Authentication
├── session/              # Session lifecycle management
├── claude/               # Claude Code PTY wrapper
├── streaming/            # Output streaming to Slack
└── storage/              # Redis + SQLite clients
```

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

## Deployment

### Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f claudewire

# Stop
docker-compose down
```

### Manual Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Start Redis:
   ```bash
   redis-server
   ```

3. Run the application:
   ```bash
   NODE_ENV=production node dist/index.js
   ```

### Systemd Service

Create `/etc/systemd/system/claudewire.service`:

```ini
[Unit]
Description=ClaudeWire - Claude Code Slack Bridge
After=network.target redis.service

[Service]
Type=simple
User=claudewire
WorkingDirectory=/opt/claudewire
EnvironmentFile=/opt/claudewire/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Security Considerations

- **User Allowlisting**: Only explicitly authorized Slack users can interact with ClaudeWire
- **Project Isolation**: Each user's projects are stored in separate directories
- **No Public Endpoints**: Socket Mode means no inbound connections required
- **Audit Logging**: All sessions and messages are logged to SQLite
- **Session Timeouts**: Inactive sessions are automatically terminated

### Recommendations

- Run ClaudeWire in a VM or container with limited permissions
- Use a dedicated service account for Claude Code
- Regularly review the SQLite audit logs
- Set restrictive `ALLOWED_USER_IDS` rather than `ALLOW_ALL_USERS`

## Roadmap

- [x] Slack integration with Socket Mode
- [x] Per-user private sessions
- [x] Thread-based output streaming
- [x] Session persistence (Redis + SQLite)
- [ ] WhatsApp integration
- [ ] Web dashboard for session management
- [ ] Multi-VM load balancing
- [ ] File upload/download via Slack
- [ ] Session sharing between users

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/claudewire.git
cd claudewire

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your test Slack app credentials

# Run in development mode
npm run dev
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Claude Code](https://claude.ai/claude-code) by Anthropic
- [Slack Bolt](https://slack.dev/bolt-js) for the excellent SDK
- [node-pty](https://github.com/microsoft/node-pty) for terminal emulation

---

**Built with Claude Code**
