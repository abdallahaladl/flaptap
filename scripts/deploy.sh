#!/usr/bin/env bash
# =============================================================================
# Flaptap AI — Automated Production Deployment & Health Verification Script
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "========================================================"
echo "🚀 Flaptap AI — Production Deployment"
echo "========================================================"

# 1. Environment check
if [ ! -f ".env" ]; then
  if [ -f ".env.production.example" ]; then
    echo "⚠️  No .env file found. Copying .env.production.example to .env..."
    cp .env.production.example .env
    echo "❗ Please edit .env with your real OPENCODE_GO_API_KEY and DOMAIN, then re-run ./scripts/deploy.sh."
    exit 1
  else
    echo "❌ Error: .env file missing. Please create one before deploying."
    exit 1
  fi
fi

# Ensure data directory exists with write permissions
mkdir -p data/transcripts
chmod -R 777 data

# 2. Check if Docker is available
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "📦 Docker & Docker Compose detected. Building and launching production stack..."

  echo "🔨 Building Flaptap production container..."
  docker compose build

  echo "🚀 Starting containers (Flaptap + Caddy)..."
  docker compose up -d

  echo "⏳ Waiting for health check to pass on http://127.0.0.1:3333/api/health..."
  MAX_RETRIES=15
  COUNT=0
  HEALTHY=0

  while [ $COUNT -lt $MAX_RETRIES ]; do
    sleep 2
    COUNT=$((COUNT + 1))
    if curl -s -f http://127.0.0.1:3333/api/health >/dev/null 2>&1; then
      HEALTHY=1
      break
    fi
    echo "   ... waiting for service to become healthy ($COUNT/$MAX_RETRIES)"
  done

  if [ $HEALTHY -eq 1 ]; then
    echo "✅ Healthcheck passed! Service is online and operational."
    curl -s http://127.0.0.1:3333/api/health | python3 -m json.tool 2>/dev/null || curl -s http://127.0.0.1:3333/api/health
    echo ""
    echo "🎉 Flaptap AI is live in production!"
    echo "   Local ingress: http://127.0.0.1:3333"
    echo "   Caddy ingress: ports 80 & 443"
    echo "   Logs command:  docker compose logs -f flaptap"
  else
    echo "❌ Health check timed out. Showing recent container logs:"
    docker compose logs --tail=50 flaptap
    exit 1
  fi

else
  echo "ℹ️  Docker not detected. Deploying via direct Node.js 22 runtime..."

  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 22 ]; then
    echo "❌ Flaptap requires Node.js v22 or higher for native node:sqlite DatabaseSync (Current: $(node -v))."
    exit 1
  fi

  echo "📦 Installing Python dependencies..."
  pip3 install -r requirements.txt

  echo "🔨 Building TypeScript backend..."
  npm run build

  echo "✅ Application successfully built. Run with:"
  echo "   NODE_ENV=production node backend/dist/main.js"
fi
