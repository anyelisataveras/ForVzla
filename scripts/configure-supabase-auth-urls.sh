#!/usr/bin/env bash
# Configura Site URL y Redirect URLs cuando el dashboard de Supabase no guarda.
# Uso:
#   1. Crea un token en https://supabase.com/dashboard/account/tokens
#   2. export SUPABASE_ACCESS_TOKEN="sbp_..."
#   3. ./scripts/configure-supabase-auth-urls.sh

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-ebsgvamzaegjgpjkpick}"
SITE_URL="${SITE_URL:-https://www.forvzla.org}"
ALLOW_LIST="${ALLOW_LIST:-https://www.forvzla.org/admin.html
https://www.forvzla.org/**
http://localhost:3000/admin.html
http://localhost:3000/**}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "❌ Falta SUPABASE_ACCESS_TOKEN"
  echo "   Crea uno en: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

echo "→ Configurando auth URLs para proyecto $PROJECT_REF ..."
curl -sS -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg site "$SITE_URL" \
    --arg list "$ALLOW_LIST" \
    --arg otp_tpl '<h2>Ayuda Venezuela — Admin</h2><p>Tu código de acceso:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p><p>Válido 1 hora. Si no pediste esto, ignora este correo.</p>' \
    '{site_url: $site, uri_allow_list: $list, external_email_enabled: true, mailer_templates_magic_link_content: $otp_tpl}')" \
  | jq '{site_url, uri_allow_list, external_email_enabled, mailer_templates_magic_link_content}'

echo ""
echo "✓ Listo. Reinicia el proyecto en Dashboard → Settings → General si el cambio no aplica al instante."
