# Scraper — Ingesta de redes sociales

Convierte posts públicos de **Instagram, TikTok, Twitter/X y Telegram** en la cola **`posts_redes`** para moderación humana.

## Flujo

1. **Scraper** → clasifica con Claude → guarda en `posts_redes`
   - `estado=pendiente` si es necesidad/rescate (confianza ≥ 0.55)
   - `estado=descartado` si es ruido (informativo, centro acopio, etc.)
2. **Coordinador** → tab **Moderar** en la app (PIN) → aprueba o rechaza
3. **Al aprobar** → RPC `aprobar_post_redes` crea fila en `necesidades` con `validada=true`
4. **Dedup geo** al aprobar (<200 m, mismo tipo) → confirma existente en vez de duplicar

## Migraciones requeridas

Aplicar en Supabase SQL Editor (en orden):

1. `20250626150000_scraper_fuentes_twitter_telegram.sql`
2. `20250626160000_posts_redes_moderacion.sql`

## Admin (`public/admin.html`)

Panel separado con **magic link** (Supabase Auth):

- Moderar posts → necesidad / edificio / ambos
- Agregar edificios colapsados y centros de acopio
- Correr scraper (requiere `npm run server` en otra terminal)

### Setup Supabase Auth

1. Dashboard → Authentication → Providers → **Email** activado
2. URL Configuration → Redirect URLs:
   - `http://localhost:3000/admin.html`
   - `https://TU-DOMINIO/admin.html`
3. Aplicar migración `20250626170000_admin_auth.sql`
4. Aplicar migraciones (incluye `20250626170200_seed_admin_anyelisa.sql`)

### Correr scraper desde admin

```bash
# Terminal 1 — app
npm run dev

# Terminal 2 — servidor scraper (local)
npm run scraper:server
```

Abre `http://localhost:3000/admin.html`

### Desplegar servidor scraper (Railway)

1. En Railway: nuevo servicio desde el repo, **root directory** = `scraper`
2. Variables de entorno (mismas que `.env` + publishable key):
   - `APIFY_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_KEY` (service_role)
   - `SUPABASE_ANON_KEY` (publishable; verifica JWT en POST /run)
3. Genera dominio público en Railway → copia la URL
4. Pégala en `public/scraper-config.js` → `window.SCRAPER_URL = 'https://...'`
5. Commit + push (Vercel redeploya el admin)

El admin en prod llama a esa URL; en local sigue usando `http://localhost:3456`.

## Requisitos

- Node 18+
- `APIFY_TOKEN`, `ANTHROPIC_API_KEY`, `SUPABASE_KEY` (service_role)

## Uso

```bash
npm install
cp ../.env.example .env

npm run dry      # prueba sin escribir
npm run purge    # borra seeds
npm run ingesta  # llena posts_redes
```
