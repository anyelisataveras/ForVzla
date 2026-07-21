# ARTIFACT-FOR-003
# Link público por solicitud de ayuda
# Status: ready
# ICP: Coordinadoras / grupos de voluntariado que difunden en redes, y quien publica SOS en campo y lo comparte
# Depends on: none

---

## Why we are building this

**Customer problem:**
Grupos como Cuidadoras Caracas publican pedidos de ayuda en reels/redes, pero no tienen un link estable a la solicitud en ForVzla: quien ve el post no llega al detalle ni puede ayudar sin buscar en el mapa. Quien publica tampoco ve un link listo al terminar de crear.

**Evidence:**
| Interview | ICP | Signal |
|-----------|-----|--------|
| conversacion-link-publico-jeudy-dari-2026-07-21 | team | "me interesa mucho tener el link, solo que lamentablemente el tiempo mío muy corto" |
| conversacion-dari-direccion-link-post-publish-2026-07-21 | team | "la logre montar pero no me salio el link, nose donde lo puedo visualizar" |

**ICP-weighted signal score:** 1.0
**Confidence:** medium — dos señales de WhatsApp de campo (Jeudy + Dari, 2026-07-21), no aún procesadas vía synthesize-meeting; ICP profiles stub vacío.

---

## Job to be done

Cuando publico una necesidad (o un reel), quiero un link listo para pegar, para que quien lo abra vea el detalle y pueda ayudar sin tener que buscar en el mapa.

---

## Scope

### In scope
- [ ] URL estable por necesidad abierta (`?need=<id>` canónico de la app; alineado al contrato documentado en Guau)
- [ ] Landing al abrir el link (lectura completa, sin truncar): urgencia, tipos, zona/dirección/ruta, descripción multilínea (lista de donaciones, fecha/cronograma, llamado a voluntariado), atribución de grupo si aplica (`grupo_nombre` / `grupo_slug`), link al post original (`source_url`) si existe, + CTAs existentes (llamar / WA / aportar / ruta)
- [ ] Tras Publicar SOS: bloque inmediato Copiar link / Compartir (gap Dari)
- [ ] Compartir desde lista/mapa incluye esa URL en el texto compartido
- [ ] Si la necesidad está cubierta/cerrada: mensaje claro sin CTAs de ayuda

### Out of scope
- Open Graph / preview rica en Instagram/WhatsApp — IG a menudo no muestra preview; valor está en la página al abrir
- Acortador tipo bit.ly / dominio custom solo para shares — URL canónica de la app basta
- Analytics por click del link (quién llegó desde reel) — post-MVP
- Editar la necesidad desde el link público sin auth — solo lectura + CTAs de ayudar
- Campos estructurados nuevos en BD (`fecha_evento`, `punto_encuentro`, lista_items tipada) — MVP muestra lo ya guardado en `descripcion`/`otro`/`dirección`

### Success definition
Publico (o abro) una necesidad, copio el link en un toque, lo pego en el reel/WA, y quien entra ve qué se necesita y puede contactar o aportar sin buscar en el mapa.

### MVP boundary
Permalink por necesidad + landing con detalle completo (grupo, lista de donaciones, cronograma/fecha en descripción, `source_url`, CTAs) + Copiar/Compartir post-publicar + `shareNeed` incluye URL + estado cerrada sin CTAs de ayuda. Sin OG, acortador, analytics de click, edición pública ni columnas nuevas de evento.

---

## Acceptance criteria

- [ ] Given a necesidad abierta con `id` conocido, when a visitor opens the app URL with `?need=<id>`, then the app shows that need’s full public detail (not only the home map) without requiring a search.
- [ ] Given the visitor opened `?need=<id>` for an open need, when the landing renders, then they see urgencia, tipos, zona, dirección (and route CTA if coords exist), and the full multiline `descripcion` without truncation that hides donation lists or schedule text.
- [ ] Given the need has `grupo_slug` / `grupo_nombre`, when the landing renders, then the group attribution is visible.
- [ ] Given the need has `source_url`, when the landing renders, then a control opens the original post (e.g. Instagram reel).
- [ ] Given the need is `pendiente` or `en_proceso`, when the landing renders, then existing help CTAs are available (llamar and/or WA when contact exists, aportar when applicable, ruta when coords exist).
- [ ] Given a user just successfully published a SOS, when the success UI appears, then they can copy the public need URL in one tap (and optionally use native share), without hunting for it elsewhere.
- [ ] Given a need card or map popup with share, when the user shares, then the shared text includes the same public `?need=<id>` URL.
- [ ] Given a need whose `estado` is cubierta/cerrada (or equivalent non-helpable), when a visitor opens `?need=<id>`, then they see a clear closed message and help CTAs are not offered.
- [ ] Given VG1 validation with Dari/Jeudy, when they publish or open their need, then they can copy the link in one tap (opening + help CTAs are internal smoke only, not VG1).

---

## Existing surfaces affected

| Surface | Change |
|---------|--------|
| `sos-pedir-ayuda` | After successful insert: show Copy link / Compartir with canonical `?need=<id>`; do not only toast + `resetNeed` |
| `sos-ayudar-cercania` | Deep-link entry + landing detail; `shareNeed` text includes URL; reuse contact/aporte/ruta CTAs |
| `aportes-necesidad` | Aportar CTA from landing when need is open (existing flow) |

## New capabilities required

| Capability | Description |
|------------|-------------|
| `sos-link-publico-necesidad` | Canonical public URL per need, deep-link bootstrap on load, full-detail landing, post-publish copy surface |

---

## Dependencies

| Feature | Status |
|---------|--------|
| none (blocking) | — |

Note: `docs/guau-forvzla-integration.md` already documents `?need=<uuid>` as the ForVzla deep-link contract; MVP must implement that query param (not invent a second path like `/n/<id>` unless planner later justifies it). Bug de dirección/Google Maps (Dari) is a separate ticket — does not block this epic. Caso ancla prod: necesidad `444999ab-91f4-4a66-936a-6d7eff397223` (Cuidadoras Caracas, jornada 23 jul).

---

## Mockup

No mockup. UX agent in ADWF pipeline (optional Phase B) if layout of post-publish copy block needs design notes; otherwise builder can mirror existing toast/modal patterns in `public/index.html`.

---

## Stack notes

- Static PWA: HTML + CSS + JS inline in `public/index.html` (no React/Vite/bundler) + Supabase + Leaflet/OSM + PostHog
- Deep link: parse `URLSearchParams` `need` on load; fetch need by id (RLS public read already on open needs); render detail view / screen already used by ayudar flow where possible
- Share URL: `${origin}${pathname}?need=${id}` (production origin e.g. `https://forvzla.vercel.app` or current host)
- Sanitizar HTML en popups/landing (quitar comillas simples como el resto de Leaflet popups)
- No new DB columns for MVP; `solicitante_tipo=grupo` already allowed (migración `20250721194500_fix_necesidades_solicitante_tipo_grupo.sql` applied in prod)
- Do not use localStorage/sessionStorage

---

## ADWF pipeline gates

| Gate | Trigger | Approver |
|------|---------|----------|
| Spec review | Before planner | PM |
| Plan review | After planner | PM |
| PR review | After builder | Eng lead |

---

## Validation gates resolved

| Gate | Question | Answer |
|------|----------|--------|
| VG1 | Tras ship, ¿Dari/Jeudy publican, copian link, y confirman detalle + ayuda en el teléfono? | Acotado por PM (2026-07-21): basta poder **copiar el link** (un toque). Apertura + CTAs = smoke QA interno, no VG1. |

---

## Linked artifacts

scope_file: Features/link-publico-necesidad/scope.yaml
mockup_file: null
interview_ids:
  - conversacion-link-publico-jeudy-dari-2026-07-21
  - conversacion-dari-direccion-link-post-publish-2026-07-21
linear_issue_id: null
pr_url: null
