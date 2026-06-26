#!/usr/bin/env bash
# Crea o actualiza usuarios admin con contraseña compartida (sin OTP).
# Lee SUPABASE_URL y SUPABASE_KEY (service_role) del .env del repo.
#
# Uso:
#   ./scripts/create-admin-user.sh          # los 2 admins, contraseña vzla26
#   ./scripts/create-admin-user.sh all vzla26
#   ./scripts/create-admin-user.sh campinsmc@gmail.com vzla26

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/.env" 2>/dev/null || true

URL="${SUPABASE_URL:-https://ebsgvamzaegjgpjkpick.supabase.co}"
KEY="${SUPABASE_KEY:-}"
PASS="${2:-vzla26}"
TARGET="${1:-all}"

ADMINS=(
  "anyelisa.taveras@gmail.com"
  "campinsmc@gmail.com"
)

if [[ -z "$KEY" ]]; then
  echo "❌ Falta SUPABASE_KEY (service_role) en .env"
  exit 1
fi

upsert_admin() {
  local email="$1"
  echo "→ $email"
  local encoded
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")
  local existing user_id
  existing=$(curl -sS "${URL}/auth/v1/admin/users?email=${encoded}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "apikey: ${KEY}")
  user_id=$(echo "$existing" | jq -r '.users[0].id // empty')
  if [[ -n "$user_id" ]]; then
    curl -sS -X PUT "${URL}/auth/v1/admin/users/${user_id}" \
      -H "Authorization: Bearer ${KEY}" \
      -H "apikey: ${KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"password\":\"${PASS}\",\"email_confirm\":true}" \
      | jq '{id, email, email_confirmed_at}'
  else
    curl -sS -X POST "${URL}/auth/v1/admin/users" \
      -H "Authorization: Bearer ${KEY}" \
      -H "apikey: ${KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${email}\",\"password\":\"${PASS}\",\"email_confirm\":true}" \
      | jq '{id, email, email_confirmed_at}'
  fi
}

if [[ "$TARGET" == "all" ]]; then
  for email in "${ADMINS[@]}"; do
    upsert_admin "$email"
  done
else
  upsert_admin "$TARGET"
fi

echo ""
echo "✓ Listo. Entra en admin.html con tu correo y contraseña: ${PASS}"
