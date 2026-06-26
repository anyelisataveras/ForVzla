#!/usr/bin/env bash
# Purga seeds + corre ingesta. Requiere ForVzla/.env con las 3 claves.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f ../.env ]]; then
  echo "❌ Crea ForVzla/.env desde .env.example (APIFY_TOKEN, ANTHROPIC_API_KEY, SUPABASE_KEY)"
  exit 1
fi

echo "═══ 1/2 Purge seeds ═══"
node purge_seeds.js

echo ""
echo "═══ 2/2 Ingesta redes ═══"
echo "   (aplica primero la migración twitter/telegram en SQL Editor si no lo hiciste)"
node ingesta_redes.js

echo ""
echo "✅ Listo. Revisa Supabase > Table Editor > necesidades"
