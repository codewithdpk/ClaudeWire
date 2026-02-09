# Contributing to ClaudeWire

Thank you for your interest in contributing to ClaudeWire! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/your-org/claudewire/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Your environment (Node.js version, OS, etc.)
   - Relevant logs or error messages

### Suggesting Features

1. Check existing issues for similar suggestions
2. Create a new issue with the `enhancement` label
3. Describe the feature and its use case
4. Explain why it would benefit users

### Submitting Pull Requests

1. **Fork and clone** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following our coding standards
4. **Test your changes**:
   ```bash
   npm run typecheck
   npm test
   ```
5. **Commit** with a clear message:
   ```bash
   git commit -m "feat: add amazing feature"
   ```
6. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** against `main`

## Development Setup

### Prerequisites

- Node.js 20+
- Redis (local or Docker)
- A Slack workspace for testing

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/claudewire.git
cd claudewire

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your test Slack app credentials
# (Create a separate Slack app for development)

# Run in development mode with hot reload
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck
```

## Coding Standards

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Avoid `any` — use `unknown` if type is truly unknown

### Code Style

- Use 2-space indentation
- Use single quotes for strings
- No semicolons (configured in project)
- Use meaningful variable names
- Keep functions small and focused

### File Organization

```
src/
├── component/
│   ├── index.ts      # Main exports
│   ├── types.ts      # Type definitions
│   └── *.ts          # Implementation files
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `style:` — Code style (formatting, etc.)
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

Examples:
```
feat: add WhatsApp integration
fix: handle Redis connection timeout
docs: update installation instructions
refactor: extract message parsing logic
```

## Pull Request Guidelines

### Before Submitting

- [ ] Code compiles without errors (`npm run typecheck`)
- [ ] All tests pass (`npm test`)
- [ ] New code has appropriate test coverage
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventional commits

### PR Description

Include:
- What the PR does
- Why the change is needed
- How to test the changes
- Screenshots (for UI changes)
- Breaking changes (if any)

### Review Process

1. A maintainer will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge

## Project Structure

```
claudewire/
├── src/
│   ├── index.ts              # Entry point
│   ├── config/               # Configuration management
│   ├── slack/                # Slack integration
│   │   ├── bot.ts            # Bolt app setup
│   │   ├── handlers.ts       # Event handlers
│   │   └── commands.ts       # Command parsing
│   ├── gateway/              # Auth and routing
│   ├── session/              # Session management
│   ├── claude/               # Claude Code wrapper
│   ├── streaming/            # Output streaming
│   └── storage/              # Redis + SQLite
├── tests/                    # Test files
├── docs/                     # Documentation
└── docker/                   # Docker configs
```

## Adding New Features

### Adding a New Platform (e.g., Discord)

1. Create a new directory: `src/discord/`
2. Implement the platform adapter following `src/slack/` as reference
3. Add platform-specific types in `types.ts`
4. Wire up in `src/index.ts`
5. Add configuration options
6. Update documentation

### Adding a New Command

1. Add the command type in `src/slack/types.ts`
2. Add parsing logic in `src/slack/commands.ts`
3. Implement the handler
4. Add tests
5. Update the help command and documentation

## Questions?

- Open a [Discussion](https://github.com/your-org/claudewire/discussions) for questions
- Join our community chat (if available)
- Tag maintainers in issues if urgent

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
