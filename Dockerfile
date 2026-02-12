# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies and Claude Code
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (adjust as needed for actual installation)
# This assumes Claude Code is available via npm or a similar method
# RUN npm install -g @anthropic-ai/claude-code

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Rebuild native modules for production image
RUN npm rebuild node-pty better-sqlite3

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create directories with open permissions (user set via docker-compose)
RUN mkdir -p /app/data /app/projects && chmod 777 /app/data /app/projects

# Set environment
ENV NODE_ENV=production
ENV PROJECTS_DIR=/app/projects
ENV SQLITE_PATH=/app/data/claudewire.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start
CMD ["node", "dist/index.js"]
