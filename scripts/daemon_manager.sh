#!/usr/bin/env bash
# =============================================================================
# Flaptap AI — Local & Same-Wi-Fi Daemon Manager
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

LOGS_DIR="${ROOT_DIR}/data/logs"
PLIST_APP="${HOME}/Library/LaunchAgents/com.flaptap.app.plist"

mkdir -p "${LOGS_DIR}"
mkdir -p "${ROOT_DIR}/data/transcripts"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env" 2>/dev/null || true
  set +a
fi

get_lan_ip() {
  local ip
  ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")"
  if [ -n "$ip" ]; then
    echo "$ip"
  else
    echo "127.0.0.1"
  fi
}

get_local_urls() {
  local port="${PORT:-3333}"
  local lan_ip
  lan_ip="$(get_lan_ip)"
  echo "http://localhost:${port}"
  if [ "$lan_ip" != "127.0.0.1" ]; then
    echo "http://${lan_ip}:${port}"
  fi
}

start_all() {
  echo "Building TypeScript backend..."
  npm run build

  echo "Starting Flaptap LaunchAgent..."
  launchctl unload "$PLIST_APP" 2>/dev/null || true
  launchctl load -w "$PLIST_APP"

  local port="${PORT:-3333}"
  echo "Waiting for local service health..."
  local count=0
  while [ $count -lt 15 ]; do
    if curl -s -f "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      local lan_ip
      lan_ip="$(get_lan_ip)"
      echo "=================================================================="
      echo "Flaptap is online on port ${port}:"
      echo "  Computer / USB: http://localhost:${port}"
      if [ "$lan_ip" != "127.0.0.1" ]; then
        echo "  Same Wi-Fi:     http://${lan_ip}:${port}"
      fi
      echo "=================================================================="
      return 0
    fi
    sleep 1
    count=$((count + 1))
  done

  echo "Service did not become healthy within 15s."
  return 1
}

stop_all() {
  echo "Stopping Flaptap service..."
  launchctl unload "$PLIST_APP" 2>/dev/null || true
  echo "Flaptap service stopped."
}

status() {
  local port="${PORT:-3333}"
  local lan_ip
  lan_ip="$(get_lan_ip)"
  echo "--- Flaptap Service Status ---"

  if launchctl list com.flaptap.app >/dev/null 2>&1; then
    echo "App: Active under launchd"
    echo "Local URL:     http://localhost:${port}"
    if [ "$lan_ip" != "127.0.0.1" ]; then
      echo "Same-Wi-Fi URL: http://${lan_ip}:${port}"
    fi
  else
    echo "App: Stopped"
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
    get_local_urls
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|url}"
    exit 1
    ;;
esac
