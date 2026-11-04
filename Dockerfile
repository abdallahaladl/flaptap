# =============================================================================
# Flaptap AI — Production Multi-Stage Container Image
# =============================================================================
# Stage 1: Compile NestJS TypeScript Application
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci

COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
RUN cd backend && npm run build

# Stage 2: Production Runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install system dependencies: Python 3, venv, ffmpeg (for audio alignment), and curl (for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Set up isolated Python virtual environment for YouTube transcription tooling
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install backend production dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy compiled backend dist and static assets
COPY --from=builder /app/backend/dist ./backend/dist
COPY frontend ./frontend
COPY skills ./skills
COPY scripts ./scripts

# Prepare persistent data directory with proper read/write permissions
RUN mkdir -p /app/data/transcripts && chmod -R 777 /app/data

ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0
ENV FLAPTAP_SQLITE_PATH=/app/data/flaptap.sqlite
ENV TRUST_PROXY=1

EXPOSE 3333

# Production healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:3333/api/health || exit 1

CMD ["node", "backend/dist/main.js"]
