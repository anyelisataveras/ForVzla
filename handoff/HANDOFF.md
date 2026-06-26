# HANDOFF — Ayuda Venezuela (SOS App)
### Terremoto Yaracuy 24-jun-2026 · estado v3 · para continuar en Cursor

> **Qué es:** PWA de una sola página (sin build, sin backend propio) que une a quien
> necesita ayuda con quien puede ayudar, por proximidad, tras el terremoto.
> **Stack:** HTML/JS estático + Supabase (BD + realtime) + Leaflet/OSM + scraper Node (Apify + Claude).
> **Costo:** $0/mes. **Despliegue:** arrastrar `index.html` a Netlify Drop.

---

## 0. Para Cursor — léeme primero

- **`index.html` es la app completa.** Un solo archivo: HTML + CSS + JS inline. No hay framework, no hay build, no hay bundler. Editas el archivo y recargas. **No lo migres a React/Vite a menos que se pida explícitamente** — el “sin build” es una decisión de diseño (deploy en 30 s, funciona con baja cobertura).
- **No uses `localStorage`/`sessionStorage`.** El estado vive en memoria + Supabase.
- **Las funciones SQL son contrato.** El front llama por RPC a `necesidades_cercanas`, `confirmar_necesidad`. Si cambias sus nombres/firmas en `db/setup_supabase.sql`, actualiza también el front.
- **La `anon/publishable key` va en el HTML a propósito** (es pública por diseño; la seguridad la da RLS). La **`service_role` key NO se comitea nunca** — solo la usa el scraper vía variable de entorno.
- Hay un `.cursorrules` en la raíz con estas reglas para el agente.

---

## 1. Estado actual (qué está hecho)

| Pieza | Archivo | Estado |
|---|---|---|
| App PWA (mapa home + SOS por toques) | `index.html` | ✅ funcional |
| Manifiesto PWA | `manifest.json` | ✅ |
| Esquema + seed + funciones dedup/proximidad | `db/setup_supabase.sql` | ✅ |
| Scraper IG/TikTok → Supabase | `scraper/ingesta_redes.js` | ✅ (requiere tokens) |
| Deps del scraper | `scraper/package.json` | ✅ |
| Guía del scraper | `scraper/README_INGESTA.md` | ✅ |
| PRD completo (módulos futuros) | `SGE_Venezuela_Requerimientos_v1.0.docx` | 📄 referencia |

**Cifras oficiales (26-jun, parte de Delcy Rodríguez):** ~235 fallecidos, +4.300 heridos, La Guaira zona de desastre. *(El handoff anterior decía 188 — desactualizado.)*

---

## 2. Cómo correrlo en local

### App (estático)
```bash
# cualquier servidor estático sirve; el GPS y el reverse-geocode necesitan https o localhost
npx serve .          # o:  python3 -m http.server 8080
# abrir http://localhost:8080
```
> Geolocalización solo funciona en `localhost` o `https`. En `file://` el GPS falla.

### Scraper
```bash
cd scraper
npm install
# prueba sin escribir en BD:
APIFY_TOKEN=xxx ANTHROPIC_API_KEY=xxx DRY_RUN=1 npm run dry
# real (requiere service_role):
cp ../.env.example .env   # y rellena valores
npm run ingesta
```

---

## 3. Arquitectura

```
Usuarios móviles
      │
 index.html (PWA, 1 archivo)
   ├── Leaflet + leaflet.heat   (mapas OSM, CDN unpkg)
   └── supabase-js              (BD + realtime, CDN jsdelivr)
      │  RPC: necesidades_cercanas(), confirmar_necesidad()
      ▼
 Supabase  (project: ebsgvamzaegjgpjkpick)
   ├── necesidades        (con dedup: source_hash, confirmaciones, merged_into, edificio_id, fuente)
   ├── recursos
   ├── centros_acopio
   └── edificios_colapsados
      ▲
 scraper/ingesta_redes.js  (Node 18, ESM)
   Apify (IG/TikTok público) → Claude Haiku (clasifica) → geocode → dedup → insert
```

---

## 4. Credenciales

| Campo | Valor |
|---|---|
| Project ID | `ebsgvamzaegjgpjkpick` |
| Project URL | `https://ebsgvamzaegjgpjkpick.supabase.co` |
| Anon / Publishable key (va en `index.html`) | `sb_publishable_vg8SSOkKpgvwOSyi2k-aVg_lslrQsBA` |
| Service role key (solo scraper, NO comitear) | *(sácala de Supabase → Project Settings → API)* |
| Dashboard | https://supabase.com/dashboard/project/ebsgvamzaegjgpjkpick |

---

## 5. Modelo de datos (lo nuevo de v2 está marcado 🆕)

### `necesidades`
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| zona / direccion_exacta | text | dirección o referencia |
| lat / lng | float8 | GPS |
| tipo / subtipo | text | subtipo solo para Herramientas |
| urgencia | text | `critica` / `urgente` / `normal` |
| descripcion / cantidad | text | |
| personas_afectadas | int 🆕 | |
| nombre_contacto / telefono / whatsapp | text | teléfono obligatorio |
| estado | text | `pendiente` / `en_proceso` / `cubierta` |
| validada | bool | `false` hasta que un coordinador apruebe |
| notas_coordinador | text | visible en la app |
| **edificio_id** | uuid 🆕 | FK → `edificios_colapsados` (reporte ligado a un colapso) |
| **fuente** | text 🆕 | `ciudadano` / `instagram` / `tiktok` / `coordinador` |
| **source_url / source_hash** | text 🆕 | huella del post de redes (`source_hash` UNIQUE) |
| **confirmaciones** | int 🆕 | nº de reportes que confirman lo mismo (default 1) |
| **merged_into** | uuid 🆕 | si != null, es un duplicado fusionado |

### Funciones RPC 🆕 (en `db/setup_supabase.sql`)
- `necesidades_cercanas(p_lat, p_lng, p_radio_m, p_tipo)` → necesidades activas ordenadas por distancia (Haversine, sin PostGIS). La usa el front para **(a)** ordenar “Ayudar” por cercanía y **(b)** detectar duplicados al reportar (radio 200 m + mismo tipo).
- `confirmar_necesidad(p_id)` → suma 1 a `confirmaciones` (en vez de crear un duplicado).

`recursos`, `centros_acopio` (15 seed) y `edificios_colapsados` (44 seed La Guaira) sin cambios estructurales relevantes.

---

## 6. Cómo funciona la app (v3)

- **Home = Mapa.** Abre mostrando edificios colapsados (rojo oscuro), necesidades por urgencia y centros de acopio. Toggle **Puntos / Calor** (heatmap de densidad). Botón **🆘 flotante** siempre visible.
- **Pedir ayuda (mínimo tipeo):** 1) toque GPS (reverse-geocode rellena zona/dirección) *o* tocar un edificio en el mapa → “🆘 Pedir ayuda aquí”; 2) rejilla de iconos para el tipo; 3) tres botones de urgencia. **Único campo escrito: teléfono.** Detalle/nombre/personas opcionales y plegados (detalle dictable por voz).
- **Antiduplicados:** antes de publicar, busca reportes del mismo tipo a <200 m; si hay, ofrece **confirmar** el existente (no duplica) o crear nuevo. Reportar desde un edificio lo liga vía `edificio_id`.
- **Ayudar:** botón “ver lo más cercano a mí” → lista ordenada por distancia real (RPC). Chips por tipo. Contacto directo (Llamar / WhatsApp con mensaje prellenado / Ruta).
- **Centros / Ofrecer:** centros ordenados por cercanía; ofrecer recurso por iconos + centro de entrega.
- **Tiempo real:** canal Supabase refresca mapa y lista cuando entra/cambia una necesidad.

---

## 7. Operación (coordinadores, sin código)

Todo desde **Supabase → Table Editor**:
- **Moderar redes:** filtra `necesidades` por `fuente in (instagram, tiktok)` y `validada = false`. Revisa y pon `validada = true`.
- **Cerrar necesidad:** `estado = cubierta` (desaparece del mapa/listas).
- **Fusionar duplicado manual:** pon `merged_into = <id del bueno>` en el duplicado.
- **Centros/edificios:** edita celdas directo; `activo=false` oculta un centro.

---

## 8. Decisiones abiertas (pendientes de definir con el equipo)

1. **Zoom inicial del mapa.** Hoy abre con vista nacional. Alternativa: centrar en la ubicación del usuario (o La Guaira por defecto) para que vea su zona sin tocar nada. *Cambio de 1 línea en `initMainMap()` / `populateMap()`.*
2. **RLS abierto.** Hoy cualquiera puede `insert`/`update` (carácter orgánico, sin fricción). Riesgo: un troll edita reportes. **Plan B preparable:** bloquear `update` público y dejar solo `insert`; el peso lo dan `confirmaciones` + moderación. Decidir cuándo endurecer.
3. **Verificar lat/lng** de centros y edificios (hoy aproximados por sector).
4. **Dominio propio** (`ayudavenezuela.org`) para compartir fácil.

---

## 9. Backlog priorizado (con prompts sugeridos para Cursor)

**P0 — afinar lo que hay**
- [ ] *“En `index.html`, haz que el mapa abra centrado en la ubicación del usuario (geolocalización); si la rechaza, cae a La Guaira (10.61, -66.84) con zoom 12.”*
- [ ] *“Añade una variante de RLS endurecido en `db/` (archivo `rls_hardening.sql`) que revoque UPDATE público en `necesidades` y deje solo INSERT/SELECT.”*

**P1 — alcance del PRD (`SGE_Venezuela_Requerimientos_v1.0.docx`)**
- [ ] **Módulo personas buscadas:** tabla `personas_buscadas` + pestaña de reporte y búsqueda; cruzar con refugios.
- [ ] **Módulo voluntarios:** registro con capacidades + asignación por zona (alimenta el heatmap).
- [ ] **Notificaciones:** webhook Supabase → Twilio/WhatsApp cuando entra una necesidad `critica`.

**P2 — robustez**
- [ ] **Alertas de réplicas:** poll a la API de USGS y banner en la app.
- [ ] **Panel de coordinadores** dedicado (más amigable que Table Editor).
- [ ] **Service worker** real para offline básico (cache de tiles + cola de envíos).

---

## 10. Gotchas / trampas conocidas

- **Geolocalización requiere https/localhost.** En `file://` no hay GPS.
- **Nominatim (reverse-geocode y geocode del scraper) limita a ~1 req/s.** El scraper ya hace `sleep`. No lo paralelices agresivo.
- **`leaflet.heat`** se carga por CDN aparte de Leaflet; si quitas ese `<script>`, el modo “Calor” rompe.
- **Realtime** necesita que Realtime esté habilitado en la tabla `necesidades` (Supabase lo activa al correr el SQL/policies; si no llega en vivo, revisa Database → Replication).
- **El popup del mapa** inyecta HTML con datos del edificio: los nombres se sanitizan quitando comillas simples (`replace(/'/g,'')`). Si añades campos a esos popups, sanitiza igual.
- **`source_hash` es UNIQUE parcial** (solo cuando no es null): reportes ciudadanos sin hash no chocan entre sí; eso es a propósito.

---

## 11. Estructura de repo sugerida para Cursor

```
/
├─ index.html              # la app (NO mover; manifest debe acompañarla en el deploy)
├─ manifest.json
├─ .cursorrules            # reglas para el agente
├─ .env.example            # plantilla de entorno (solo para el scraper)
├─ HANDOFF.md              # este archivo
├─ db/
│  └─ setup_supabase.sql   # esquema + seed + funciones
├─ scraper/
│  ├─ ingesta_redes.js
│  ├─ package.json
│  └─ README_INGESTA.md
└─ docs/
   └─ SGE_Venezuela_Requerimientos_v1.0.docx   # PRD
```
> `db/` y `scraper/` pueden moverse libremente (no los referencia la app). `index.html` + `manifest.json` van juntos en la raíz del sitio publicado.

---

**Contexto humano:** PM del proyecto María (TIVI) + PM venezolana (Cris) que aporta la realidad de terreno. La idea madre, en palabras de Cris: *“unificar en un solo sitio quien quiera ayudar con quien lo necesite”* y *“ayudar a que la gente se ayude”*. Mantén ese norte: rápido, orgánico, sin burocracia.

**#AyudaVenezuela**
