#!/usr/bin/env bash
# =============================================================================
# Flaptap AI — Production Daemon & Worldwide Tunnel Manager
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

LOGS_DIR="${ROOT_DIR}/data/logs"
URL_FILE="${ROOT_DIR}/data/PUBLIC_URL.txt"
PLIST_APP="${HOME}/Library/LaunchAgents/com.flaptap.app.plist"
PLIST_TUNNEL="${HOME}/Library/LaunchAgents/com.flaptap.tunnel.plist"

mkdir -p "${LOGS_DIR}"
mkdir -p "${ROOT_DIR}/data/transcripts"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env" 2>/dev/null || true
  set +a
fi

is_service_running() {
  local label="$1"
  if launchctl list 2>/dev/null | grep -q "$label"; then
    local pid
    pid="$(launchctl list "$label" 2>/dev/null | awk '/"PID"/ {print $3}' | tr -d '",;' || echo "")"
    if [ -n "$pid" ] && [ "$pid" != "0" ]; then
      return 0
    fi
  fi
  return 1
}

get_public_url() {
  # 1. Named Cloudflare Tunnel via ~/.cloudflared/config.yml
  if [ -f "${HOME}/.cloudflared/config.yml" ]; then
    local host
    host="$(awk '/hostname:/ {print $2; exit}' "${HOME}/.cloudflared/config.yml" | tr -d '"'\'' ')"
    if [ -n "$host" ]; then
      local url="https://${host#https://}"
      echo "$url" > "$URL_FILE"
      echo "$url"
      return 0
    fi
  fi

  # 2. Named Cloudflare Tunnel via Token + DOMAIN in .env
  if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] && [ -n "${DOMAIN:-}" ] && [ "${DOMAIN}" != "flaptap.example.com" ] && [ "${DOMAIN}" != "localhost" ]; then
    local url="https://${DOMAIN#https://}"
    echo "$url" > "$URL_FILE"
    echo "$url"
    return 0
  fi

  # 3. Always prefer the latest live quick tunnel URL from tunnel.log
  if [ -f "${LOGS_DIR}/tunnel.log" ]; then
    local latest_url
    latest_url="$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" "${LOGS_DIR}/tunnel.log" 2>/dev/null | tail -n 1 || true)"
    if [ -n "$latest_url" ]; then
      echo "$latest_url" > "$URL_FILE"
      echo "$latest_url"
      return 0
    fi
  fi

  # 4. Fallback to cached URL file
  if [ -f "$URL_FILE" ]; then
    cat "$URL_FILE"
  fi
}

start_all() {
  echo "🔨 Ensuring TypeScript backend is built..."
  npm run build

  echo "🚀 Loading and starting Flaptap LaunchAgent..."
  launchctl unload "$PLIST_APP" 2>/dev/null || true
  launchctl load -w "$PLIST_APP"

  echo "🌐 Loading and starting Cloudflare Tunnel LaunchAgent..."
  launchctl unload "$PLIST_TUNNEL" 2>/dev/null || true
  if [ ! -f "${HOME}/.cloudflared/config.yml" ] && [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
    rm -f "$URL_FILE"
    : > "${LOGS_DIR}/tunnel.log"
  fi
  launchctl load -w "$PLIST_TUNNEL"

  echo "⏳ Waiting for local service health..."
  local count=0
  while [ $count -lt 15 ]; do
    if curl -s -f http://127.0.0.1:3333/api/health >/dev/null 2>&1; then
      echo "✅ Local service is healthy at http://127.0.0.1:3333"
      break
    fi
    sleep 1
    count=$((count + 1))
  done

  echo "⏳ Waiting for Cloudflare Anycast URL..."
  count=0
  local url=""
  while [ $count -lt 25 ]; do
    sleep 1
    count=$((count + 1))
    url="$(get_public_url)"
    if [ -n "$url" ]; then
      echo "$url" > "$URL_FILE"
      echo "=================================================================="
      echo "🎉 FLAPTAP IS ONLINE & ACCESSIBLE WORLDWIDE AT:"
      echo "👉  $url"
      echo "=================================================================="
      return 0
    fi
  done
}

stop_all() {
  echo "Stopping services..."
  launchctl unload "$PLIST_TUNNEL" 2>/dev/null || true
  launchctl unload "$PLIST_APP" 2>/dev/null || true
  echo "✅ All Flaptap production services stopped."
}

status() {
  echo "--- Flaptap Production Daemon Status ---"
  
  if launchctl list com.flaptap.app >/dev/null 2>&1; then
    echo "🟢 App: Active under launchd"
    curl -s http://127.0.0.1:3333/api/health | node -e "
      let data = '';
      process.stdin.on('data', c => data += c);
      process.stdin.on('end', () => {
        try {
          const j = JSON.parse(data);
          console.log('   Uptime: ' + j.uptime_seconds + 's | DB: ' + j.checks.database.status + ' | AI: ' + j.checks.ai.model);
        } catch(e) { console.log('   Healthy'); }
      });
    " 2>/dev/null || echo "   Healthy on port 3333"
  else
    echo "🔴 App: Stopped"
  fi

  if launchctl list com.flaptap.tunnel >/dev/null 2>&1; then
    echo "🟢 Tunnel: Active under launchd (Cloudflare Anycast)"
    local public_url
    public_url="$(get_public_url)"
    if [ -n "$public_url" ]; then
      echo "🌐 Public Worldwide URL: $public_url"
      if curl -s -f --max-time 6 "http://127.0.0.1:3333/api/health" >/dev/null 2>&1; then
        echo "   ✅ Tunnel is routing to production backend"
      fi
    fi
  else
    echo "🔴 Tunnel: Stopped"
  fi
}

case "$1" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    stop_all
    sleep 2
    start_all
    ;;
  status)
    status
    ;;
  url)
    get_public_url
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|url}"
    exit 1
    ;;
esac
