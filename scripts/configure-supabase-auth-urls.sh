#!/usr/bin/env bash
# Configura auth para admin: OTP de 6 dígitos (no magic link) + redirect URLs.
#
# Supabase decide OTP vs link según la plantilla "Magic Link":
#   {{ .Token }}           → código de 6 dígitos
#   {{ .ConfirmationURL }} → enlace clickeable
#
# Uso:
#   1. Crea un token en https://supabase.com/dashboard/account/tokens
#   2. export SUPABASE_ACCESS_TOKEN="sbp_..."
#   3. ./scripts/configure-supabase-auth-urls.sh
#   ./scripts/configure-supabase-auth-urls.sh --check   # solo leer config actual

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-ebsgvamzaegjgpjkpick}"
SITE_URL="${SITE_URL:-https://www.forvzla.org}"
ALLOW_LIST="${ALLOW_LIST:-https://www.forvzla.org/admin.html
https://www.forvzla.org/**
http://localhost:3000/admin.html
http://localhost:3000/**}"
OTP_SUBJECT="Ayuda Venezuela — código de acceso"
OTP_TPL='<h2>Ayuda Venezuela — Admin</h2><p>Tu código de acceso:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p><p>Válido 1 hora. Si no pediste esto, ignora este correo.</p>'

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "❌ Falta SUPABASE_ACCESS_TOKEN"
  echo "   Crea uno en: https://supabase.com/dashboard/account/tokens"
  exit 1
fi

API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
AUTH_HDR=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")

if [[ "${1:-}" == "--check" ]]; then
  echo "→ Config auth actual ($PROJECT_REF):"
  curl -sS "$API" "${AUTH_HDR[@]}" \
    | jq '{
        site_url,
        uri_allow_list,
        mailer_autoconfirm,
        mailer_subjects_magic_link,
        mailer_templates_magic_link_content,
        mailer_templates_confirmation_content
      }'
  exit 0
fi

echo "→ Configurando OTP + URLs para proyecto $PROJECT_REF ..."
curl -sS -X PATCH "$API" \
  "${AUTH_HDR[@]}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg site "$SITE_URL" \
    --arg list "$ALLOW_LIST" \
    --arg subj "$OTP_SUBJECT" \
    --arg otp_tpl "$OTP_TPL" \
    '{
      site_url: $site,
      uri_allow_list: $list,
      external_email_enabled: true,
      mailer_autoconfirm: true,
      mailer_subjects_magic_link: $subj,
      mailer_templates_magic_link_content: $otp_tpl
    }')" \
  | jq '{
      site_url,
      uri_allow_list,
      mailer_autoconfirm,
      mailer_subjects_magic_link,
      mailer_templates_magic_link_content
    }'

echo ""
echo "✓ Listo. Pide un código nuevo (espera ~60s entre intentos)."
echo "  Si sigue llegando un link, corre: ./scripts/configure-supabase-auth-urls.sh --check"
echo "  y verifica que mailer_templates_magic_link_content tenga {{ .Token }} y NO {{ .ConfirmationURL }}."
