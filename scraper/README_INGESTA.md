# Scraper — Ingesta de redes sociales

Convierte posts públicos de Instagram y TikTok en filas de `necesidades` en Supabase.

## Requisitos

- Node 18+
- `APIFY_TOKEN` — actores: `apify/instagram-search-scraper`, `clockworks/tiktok-scraper`
- `ANTHROPIC_API_KEY` — clasificación con Claude Haiku
- `SUPABASE_KEY` — **service_role** (solo para ingesta; nunca comitear)

## Uso

```bash
npm install
cp ../.env.example .env

# Dry run (no escribe en BD):
npm run dry

# Ingesta real:
npm run ingesta
```

Los posts nuevos entran con `validada=false`. Modera en Supabase → Table Editor.

## Transición: seeds → data real

Los datos semilla están marcados con `__seed_v1__` (en `notas` o `notas_coordinador`).

**Cuando el scraper esté corriendo y haya reportes reales:**

1. Verifica que llegan filas con `fuente in ('instagram','tiktok','ciudadano')`
2. Ejecuta en SQL Editor: `db/purge_seed_data.sql`
3. Los seeds se borran; lo real se queda

Si insertaste seeds **antes** del marcador, corre primero `db/tag_existing_seeds.sql`.
