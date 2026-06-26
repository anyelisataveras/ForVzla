# ForVzla — Ayuda Venezuela

PWA de emergencia que une a quien necesita ayuda con quien puede ayudar, por proximidad.

**Stack:** HTML/JS estático + Supabase + Leaflet/OSM + scraper Node (Apify + Claude).

## Estructura

```
/
├── public/                 # App PWA (desplegada en Vercel)
│   ├── index.html
│   ├── manifest.json
│   └── icon.svg
├── supabase/
│   └── migrations/         # Migraciones versionadas para Supabase CLI
├── db/
│   └── setup_supabase.sql  # Script monolítico (SQL Editor manual)
├── scraper/                # Ingesta IG/TikTok → Supabase
├── vercel.json
├── package.json
└── HANDOFF.md              # Documentación completa del proyecto
```

## Desarrollo local

```bash
npm install
npm run dev
# → http://localhost:3000
```

> El GPS requiere `localhost` o `https`. No funciona en `file://`.

## Desplegar en Vercel

1. Conecta el repo en [vercel.com](https://vercel.com)
2. Vercel detecta `vercel.json` y sirve `public/` como sitio estático
3. No requiere variables de entorno (la anon key va en `index.html` por diseño)

```bash
# Opcional: deploy desde CLI
npx vercel
```

## Supabase — aplicar migraciones

### Con Supabase CLI (recomendado)

```bash
# Instalar CLI: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref ebsgvamzaegjgpjkpick
supabase db push
```

### Manual (SQL Editor)

Ejecuta `db/setup_supabase.sql` en Supabase → SQL Editor.  
Úsalo solo en bases vacías (incluye `DROP TABLE`).

## Scraper de redes

```bash
cd scraper && npm install
cp ../.env.example .env   # rellena APIFY_TOKEN, ANTHROPIC_API_KEY, SUPABASE_KEY

# Prueba sin escribir en BD:
npm run dry

# Ingesta real (requiere service_role):
npm run ingesta
```

## Credenciales

| Campo | Valor |
|---|---|
| Project URL | `https://ebsgvamzaegjgpjkpick.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/ebsgvamzaegjgpjkpick |

Ver `HANDOFF.md` para documentación completa.
