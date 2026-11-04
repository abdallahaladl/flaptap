#!/usr/bin/env bash
# =============================================================================
# Flaptap AI — 1-Command Custom Domain & Permanent Cloudflare Tunnel Setup
# =============================================================================
# Usage:
#   Option A (Interactive Cloudflare Login — Zero Config):
#     npm run domain:connect -- getflaptap.com
#
#   Option B (Zero Trust Token Mode):
#     npm run domain:connect -- getflaptap.com <CLOUDFLARE_TUNNEL_TOKEN>
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

CLOUDFLARED_BIN="/Users/abdallah/.local/bin/cloudflared"
if [ ! -x "$CLOUDFLARED_BIN" ]; then
  CLOUDFLARED_BIN="$(command -v cloudflared || echo "/usr/local/bin/cloudflared")"
fi

RAW_DOMAIN="${1:-}"
TUNNEL_TOKEN="${2:-}"

if [ -z "$RAW_DOMAIN" ]; then
  echo "=================================================================="
  echo "🌐 Flaptap AI — Custom Domain & Permanent SaaS Tunnel Setup"
  echo "=================================================================="
  echo "Usage:"
  echo "  npm run domain:connect -- <yourdomain.com> [optional_tunnel_token]"
  echo ""
  echo "Examples:"
  echo "  npm run domain:connect -- flaptap.xyz"
  echo "  npm run domain:connect -- getflaptap.com"
  echo "=================================================================="
  exit 1
fi

# Strip protocol and trailing slashes
CLEAN_DOMAIN="${RAW_DOMAIN#https://}"
CLEAN_DOMAIN="${CLEAN_DOMAIN#http://}"
CLEAN_DOMAIN="${CLEAN_DOMAIN%%/*}"

echo "=================================================================="
echo "🌐 Configuring Permanent SaaS Domain: https://${CLEAN_DOMAIN}"
echo "=================================================================="

upsert_env_var() {
  local key="$1"
  local val="$2"
  local env_file="${ROOT_DIR}/.env"
  touch "$env_file"
  if grep -q "^${key}=" "$env_file" 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" "$env_file"
  else
    echo "${key}=${val}" >> "$env_file"
  fi
}

upsert_env_var "DOMAIN" "${CLEAN_DOMAIN}"
upsert_env_var "GOOGLE_REDIRECT_URI" "https://${CLEAN_DOMAIN}/api/auth/google/callback"

if [ -n "$TUNNEL_TOKEN" ]; then
  echo "🔑 Configuring Token-Based Cloudflare Named Tunnel..."
  upsert_env_var "CLOUDFLARE_TUNNEL_TOKEN" "${TUNNEL_TOKEN}"
  rm -f "${HOME}/.cloudflared/config.yml"
else
  mkdir -p "${HOME}/.cloudflared"
  if [ ! -f "${HOME}/.cloudflared/cert.pem" ]; then
    echo "🔐 Opening browser to authorize your Cloudflare domain (${CLEAN_DOMAIN})..."
    "${CLOUDFLARED_BIN}" tunnel login
  fi

  TUNNEL_NAME="flaptap-prod"
  echo "🚇 Ensuring permanent Cloudflare Tunnel '${TUNNEL_NAME}' exists..."
  if ! "${CLOUDFLARED_BIN}" tunnel list | awk '{print $2}' | grep -qx "${TUNNEL_NAME}"; then
    "${CLOUDFLARED_BIN}" tunnel create "${TUNNEL_NAME}"
  fi

  TUNNEL_ID="$("${CLOUDFLARED_BIN}" tunnel list | awk -v name="${TUNNEL_NAME}" '$2 == name {print $1; exit}')"
  CRED_FILE="${HOME}/.cloudflared/${TUNNEL_ID}.json"

  echo "📝 Writing ~/.cloudflared/config.yml for ${CLEAN_DOMAIN}..."
  cat > "${HOME}/.cloudflared/config.yml" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED_FILE}
protocol: quic

ingress:
  - hostname: ${CLEAN_DOMAIN}
    service: http://127.0.0.1:3333
  - hostname: www.${CLEAN_DOMAIN}
    service: http://127.0.0.1:3333
  - service: http_status:404
EOF

  echo "🌍 Routing DNS records on Cloudflare (${CLEAN_DOMAIN} & www.${CLEAN_DOMAIN})..."
  "${CLOUDFLARED_BIN}" tunnel route dns -f "${TUNNEL_NAME}" "${CLEAN_DOMAIN}"
  "${CLOUDFLARED_BIN}" tunnel route dns -f "${TUNNEL_NAME}" "www.${CLEAN_DOMAIN}" || true
fi

echo "https://${CLEAN_DOMAIN}" > "${ROOT_DIR}/data/PUBLIC_URL.txt"

echo "🔄 Restarting Flaptap production daemons with permanent domain..."
"${ROOT_DIR}/scripts/daemon_manager.sh" restart

echo "=================================================================="
echo "✅ Permanent SaaS Domain Configured!"
echo "👉 Primary URL: https://${CLEAN_DOMAIN}"
echo "👉 OAuth Callback: https://${CLEAN_DOMAIN}/api/auth/google/callback"
echo "=================================================================="
