# ARTIFACT-FOR-002
# Galerías de jornadas para voluntarias
# Status: ready
# ICP: Volunteers (individual member, self-service)
# Depends on: jornada-media (coordinadoras upload)

---

## Why we are building this

**Customer problem:**
Las coordinadoras ya suben fotos y videos de cada jornada en el panel de coordinación, pero las voluntarias no tienen forma de verlos en la app — hoy dependen de que se los reenvíen por WhatsApp o no los ven.

**Evidence:**
| Interview | ICP | Signal |
|-----------|-----|--------|
| confirmacion-coordinadoras-galerias-jul-2026 | team | "Las voluntarias deberían ver las galerías de las jornadas" (confirmación coordinadoras piloto, jul 2026) |

**ICP-weighted signal score:** 0.5
**Confidence:** medium — señal directa del equipo coordinador del piloto; aún sin entrevista 1:1 con voluntaria sobre este punto concreto.

---

## Job to be done

Una voluntaria que participó en una jornada puede ver los recuerdos (fotos y videos) que el equipo documentó, sin pedirlas por WhatsApp.

---

## Scope

### In scope
- [ ] Miniaturas y badge de conteo (📷 N) en cards de jornadas pasadas en Mi cuenta y listado Jornadas
- [ ] CTA «Ver galería →» cuando la jornada tiene media; «Ver resumen →» si no
- [ ] Sección «Recuerdos de la jornada» en detalle de jornada (grid 3×N, fotos y videos)
- [ ] Visor fullscreen (lightbox) con navegación y contador
- [ ] RPC + read tokens para voluntarias autenticadas (solo lectura; bucket `jornada-media` privado)
- [ ] Empty states: jornada próxima sin fotos; jornada realizada sin media aún

### Out of scope
- Subida de fotos o videos por voluntarias — solo coordinadoras suben hoy
- Feed horizontal «Recuerdos recientes» en dashboard — alternativa en mockup; MVP usa thumbs en cards
- Galería visible sin login — espacio privado del grupo
- Compartir nativo / descarga explícita desde visor — long-press nativo en móvil para MVP
- Badge «Nuevas» por fotos de los últimos 7 días — UX open

### Success definition
Una voluntaria entra a Mi cuenta, ve en jornadas pasadas si hay fotos, abre la galería completa y recorre los recuerdos de la jornada en el móvil.

### MVP boundary
Lectura de `jornada_media` existente vía RPC con credenciales de voluntaria + thumbs en listado + galería y lightbox en `jornada.html` (piloto Cuidadoras Caracas).

---

## Acceptance criteria

- [ ] Given una voluntaria autenticada en Mi cuenta, when abre el tab Pasadas y una jornada realizada tiene fotos subidas por coordinadora, then ve una franja de miniaturas, badge `📷 N` y CTA «Ver galería →».
- [ ] Given una voluntaria en tab Próximas, when ve el listado de jornadas, then no aparecen miniaturas ni badge de fotos en las cards.
- [ ] Given una jornada pasada sin media, when la voluntaria ve la card, then no hay franja de thumbs y el CTA es «Ver resumen →».
- [ ] Given una voluntaria autenticada en el detalle de una jornada con media, when abre «Recuerdos de la jornada», then ve un grid con fotos y videos (videos con indicador ▶).
- [ ] Given la galería abierta, when toca una foto o video, then se abre un visor fullscreen con contador y puede pasar anterior/siguiente.
- [ ] Given una jornada próxima sin fotos, when la voluntaria abre el detalle, then ve un mensaje claro de que las fotos aparecerán después de la jornada.
- [ ] Given una visitante sin sesión en jornada.html, when carga la página, then no ve la sección de galería (solo RSVP/login).
- [ ] Given una voluntaria autenticada, when solicita media vía RPC, then solo recibe archivos de jornadas de su grupo y con URLs firmadas de corta duración (sin acceso directo al bucket).

---

## Existing surfaces affected

| Surface | Change |
|---------|--------|
| `jornada-media` | Extender lectura a voluntarias (hoy solo moderadoras vía RLS) |
| `jornadas-eventos` | Cards de listado + detalle `jornada.html` |
| `tareas-inscripciones` | Sin cambio de contrato; galería convive con RSVP/tareas |

## New capabilities required

| Capability | Description |
|------------|-------------|
| `jornada-media-voluntario-lectura` | RPC `media_jornada_voluntario`, `resumen_media_jornadas_voluntario`, read tokens + policy storage |

---

## Dependencies

| Feature | Status |
|---------|--------|
| `jornada-media` | Shipped — coordinadoras suben en panel coord |
| `tareas-inscripciones` | Shipped — sesión voluntaria + jornada pública |

---

## Mockup

`ForVzla/public/mockup-voluntaria-galerias-jornadas.html` (6 pantallas interactivas).
Design notes: `ForVzla/workspace/runs/galerias-jornadas-voluntarias/design-notes.md`.

---

## Stack notes

- HTML/CSS/JS inline en `public/cuidadoras-caracas/` — sin build, sin framework
- Supabase: tabla `jornada_media` + bucket `jornada-media` (privado)
- Patrón read tokens igual que `voluntario_foto_read_tokens`
- Módulo compartido `jornada-media.js` (fetch RPC, thumbs, grid, lightbox)
- Sin localStorage — sesión voluntaria en memoria + `window.name` (convención existente)
- RPC contrato: credenciales `_voluntario_cred_ok` (mismo patrón que inscripciones/carnet)

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
| VG1 | ¿Voluntarias suben fotos o solo ven? | Solo lectura; coordinadoras suben. |
| VG2 | ¿Galería en próximas o solo pasadas? | Thumbs en pasadas/todas; placeholder en próximas. |
| VG3 | ¿Anónimo puede ver galería? | No; solo voluntaria autenticada del grupo. |

---

## Linked artifacts

scope_file: Features/galerias-jornada-voluntaria/scope.yaml
mockup_file: ForVzla/public/mockup-voluntaria-galerias-jornadas.html
interview_ids: []
linear_issue_id: null
pr_url: null
