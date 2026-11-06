#!/usr/bin/env bash
# =============================================================================
# Flaptap AI — Self-Healing Cloudflare Tunnel Runner (Named Domain + Quick Tunnel)
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

LOGS_DIR="${ROOT_DIR}/data/logs"
TUNNEL_LOG="${LOGS_DIR}/tunnel.log"
URL_FILE="${ROOT_DIR}/data/PUBLIC_URL.txt"
CLOUDFLARED_BIN="/Users/abdallah/.local/bin/cloudflared"

if [ ! -x "$CLOUDFLARED_BIN" ]; then
  CLOUDFLARED_BIN="$(command -v cloudflared || echo "/usr/local/bin/cloudflared")"
fi

mkdir -p "${LOGS_DIR}"

# Load environment variables if .env exists
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env" 2>/dev/null || true
  set +a
fi

sync_chrome_tabs() {
  local new_url="$1"
  if [ -z "$new_url" ]; then
    return 0
  fi
  osascript -e "
    tell application \"System Events\"
      if not (exists process \"Google Chrome\") then return
    end tell
    tell application \"Google Chrome\"
      repeat with w in windows
        repeat with t in tabs of w
          set u to URL of t
          if u contains \"trycloudflare.com\" and u does not start with \"${new_url}\" then
            set URL of t to \"${new_url}\"
          end if
        end repeat
      end repeat
    end tell
  " >/dev/null 2>&1 || true
}

# -----------------------------------------------------------------------------
# MODE 1: Token-based Named Cloudflare Tunnel (Custom Domain via Zero Trust)
# -----------------------------------------------------------------------------
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  if [ -n "${DOMAIN:-}" ] && [ "${DOMAIN}" != "flaptap.example.com" ] && [ "${DOMAIN}" != "localhost" ]; then
    echo "https://${DOMAIN#https://}" > "${URL_FILE}"
  fi
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting Named Cloudflare Tunnel (Token Mode)..." >> "${TUNNEL_LOG}"
  exec "${CLOUDFLARED_BIN}" tunnel --no-autoupdate run --logfile "${TUNNEL_LOG}" --loglevel info --token "${CLOUDFLARE_TUNNEL_TOKEN}"
fi

# -----------------------------------------------------------------------------
# MODE 2: Config-based Named Cloudflare Tunnel (~/.cloudflared/config.yml)
# -----------------------------------------------------------------------------
CF_CONFIG="${HOME}/.cloudflared/config.yml"
if [ -f "${CF_CONFIG}" ]; then
  CUSTOM_HOST="$(awk '/hostname:/ {print $2; exit}' "${CF_CONFIG}" | tr -d '"'\'' ')"
  if [ -n "${CUSTOM_HOST}" ]; then
    echo "https://${CUSTOM_HOST#https://}" > "${URL_FILE}"
  fi
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting Named Cloudflare Tunnel (Config Mode: ${CUSTOM_HOST})..." >> "${TUNNEL_LOG}"
  exec "${CLOUDFLARED_BIN}" tunnel --no-autoupdate --config "${CF_CONFIG}" --logfile "${TUNNEL_LOG}" --loglevel info run
fi

# -----------------------------------------------------------------------------
# MODE 3: Self-Healing Quick Tunnel (Auto-rotates on sleep/wake & updates URL)
# -----------------------------------------------------------------------------
: > "${TUNNEL_LOG}"

"${CLOUDFLARED_BIN}" tunnel --no-autoupdate --url http://127.0.0.1:3333 --logfile "${TUNNEL_LOG}" --loglevel info &
CF_PID=$!

cleanup() {
  kill -TERM "$CF_PID" 2>/dev/null || true
  wait "$CF_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

CURRENT_URL=""
DEAD_COUNT=0

while kill -0 "$CF_PID" 2>/dev/null; do
  if [ -z "$CURRENT_URL" ]; then
    DETECTED_URL="$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" "${TUNNEL_LOG}" 2>/dev/null | tail -n 1 || true)"
    if [ -n "$DETECTED_URL" ]; then
      CURRENT_URL="$DETECTED_URL"
      echo "$CURRENT_URL" > "${URL_FILE}"
    fi
  fi

  # Detect expired quick tunnel after macOS sleep/wake ("Unauthorized: Tunnel not found")
  if grep -q "Unauthorized: Tunnel not found" "${TUNNEL_LOG}" 2>/dev/null; then
    DEAD_COUNT=$((DEAD_COUNT + 1))
    if [ "$DEAD_COUNT" -ge 2 ]; then
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Quick tunnel expired after sleep; rotating tunnel..." >> "${LOGS_DIR}/tunnel.out.log"
      kill -TERM "$CF_PID" 2>/dev/null || true
      wait "$CF_PID" 2>/dev/null || true
      exit 1
    fi
  fi

  if [ -z "$CURRENT_URL" ]; then
    sleep 2 &
  else
    sleep 15 &
  fi
  wait $! || true
done

wait "$CF_PID"
