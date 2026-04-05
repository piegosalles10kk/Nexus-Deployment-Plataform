#!/usr/bin/env bash
# Usage:
#   curl -sSL https://your-backend/install.sh | sudo bash -s -- \
#       --token  YOUR_TOKEN \
#       --master wss://your-backend/ws/agent
set -euo pipefail

# ── Argument parsing ─────────────────────────────────────────────────────────
TOKEN=""
MASTER_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)   TOKEN="$2";      shift 2 ;;
    --master)  MASTER_URL="$2"; shift 2 ;;
    *)         echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" || -z "$MASTER_URL" ]]; then
  echo "Error: --token and --master are required."
  exit 1
fi

# ── Detect OS and architecture ────────────────────────────────────────────────
OS=$(uname -s | tr '[:upper:]' '[:lower:]')   # linux | darwin
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)          ARCH="amd64" ;;
  aarch64|arm64)   ARCH="arm64" ;;
  *)               echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Derive HTTPS base URL from the WSS master URL
BASE_URL=$(echo "$MASTER_URL" | sed 's|^wss://|https://|' | sed 's|/ws/agent$||')
BIN_URL="${BASE_URL}/downloads/10kk-agent-${OS}-${ARCH}"
BIN_PATH="/usr/local/bin/10kk-agent"
CERT_DIR="/etc/10kk/certs"

echo "==> Detected: ${OS}/${ARCH}"
echo "==> Downloading 10kk-agent from ${BIN_URL}"

# ── Download binary ───────────────────────────────────────────────────────────
curl -fsSL -o "$BIN_PATH" "$BIN_URL"
chmod +x "$BIN_PATH"

# ── Create cert directory ─────────────────────────────────────────────────────
mkdir -p "$CERT_DIR"
chmod 700 "$CERT_DIR"

# ── Enroll: request certificates from the Master ─────────────────────────────
echo "==> Enrolling with master at ${BASE_URL}"
ENROLL_RESP=$(curl -fsSL -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  "${BASE_URL}/api/v1/agent/enroll")

echo "$ENROLL_RESP" | python3 -c "
import sys, json, base64
d = json.load(sys.stdin)
open('/etc/10kk/certs/ca.crt',     'w').write(d['ca_crt'])
open('/etc/10kk/certs/client.crt', 'w').write(d['client_crt'])
open('/etc/10kk/certs/client.key', 'w').write(d['client_key'])
print('  certificates written to /etc/10kk/certs/')
" 2>/dev/null || {
  # fallback: use jq if python3 is not available
  echo "$ENROLL_RESP" | jq -r '.ca_crt'     > "$CERT_DIR/ca.crt"
  echo "$ENROLL_RESP" | jq -r '.client_crt' > "$CERT_DIR/client.crt"
  echo "$ENROLL_RESP" | jq -r '.client_key' > "$CERT_DIR/client.key"
  echo "  certificates written to $CERT_DIR/"
}
chmod 600 "$CERT_DIR/client.key"

# ── Install as system service ─────────────────────────────────────────────────
echo "==> Installing 10kk-agent as system service"
"$BIN_PATH" -service install -master "$MASTER_URL" -token "$TOKEN"

# ── Start service ─────────────────────────────────────────────────────────────
if command -v systemctl &>/dev/null; then
  systemctl enable 10kk-agent
  systemctl start  10kk-agent
  echo "==> Service started via systemctl"
elif command -v launchctl &>/dev/null; then
  launchctl load /Library/LaunchDaemons/10kk-agent.plist 2>/dev/null || true
  echo "==> Service loaded via launchctl"
fi

echo ""
echo "✓ 10KK Agent installed and running."
echo "  Master  : $MASTER_URL"
echo "  Logs    : journalctl -u 10kk-agent -f    (Linux)"
echo "            tail -f /var/log/10kk-agent.log (macOS)"
