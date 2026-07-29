# ARTIFACT-FOR-004
# Censo sociofamiliar por jornada
# Status: ready
# ICP: Voluntaria de campo (inscrita en jornada, captura el censo); Coordinadora/moderadora (consume y exporta)
# Depends on: jornadas-eventos, tareas-inscripciones, voluntarios-registro, sitios-catalogo

---

## Why we are building this

**Customer problem:**
En cada jornada las voluntarias entrevistan familias afectadas, pero hoy el censo sociofamiliar vive en papel/WhatsApp y no queda ligado al sitio ni a la jornada. Coordinación no puede ver ni exportar lo levantado sin reconstruir la información a mano.

**Evidence:**
| Interview | ICP | Signal |
|-----------|-----|--------|
| 2026-07-05-voluntarias-cuidadoras-caracas | team | "Ren ya hizo un censo inicial… pero no logra mantenerlo al día con el ritmo del chat." |
| conversacion-censo-cuidadoras-caracas-2026-07-29 | team | "Incluir un censo a cada jornada para levantar necesidades específicas de las personas afectadas." |

**ICP-weighted signal score:** 1.0
**Confidence:** low — pedido directo del grupo + docx de encuesta; sin entrevista formal procesada ni ICP profiles poblados.

**Formulario fuente:** `Context/source-docs/Encuesta_Sociofamiliar_Madres_Cuidadoras_Voluntarias.docx`

---

## Job to be done

Una voluntaria inscrita en una jornada registra la situación sociofamiliar de cada familia que entrevista en el sitio visitado para que coordinación identifique necesidades prioritarias y haga seguimiento.

---

## Scope

### In scope
- [ ] Formulario de 7 bloques basado en el docx (representante, vivienda, núcleo familiar con tabla, salud, apoyos recibidos, necesidades prioritarias, observaciones + uso interno auto-rellenado), mobile-first
- [ ] Deduplicación por cédula del representante a nivel de **grupo** (cualquier sitio/jornada): aviso si ya existe, con ver registro o crear nuevo
- [ ] Censo asociado a `jornada_id` + `sitio_id` + `voluntaria_id`; fecha, lugar y voluntaria responsable auto-rellenados
- [ ] Panel coordinadora: lista por jornada (nombre representante, prioridad, voluntaria), detalle completo, export CSV solo coordinadoras
- [ ] Online-first: aviso si falla el guardado por red; advertencia de que se pueden perder datos si se cierra la pestaña o se pierde conexión antes de guardar

### Out of scope
- Modo offline real / cola IndexedDB — Fase 2; PII en dispositivo + excepción a no-persistencia local
- Edición post-guardado por la voluntaria — coordinadora puede corregir desde el panel
- Notificaciones push a coordinadora — no hay push en el proyecto
- Cruce automático con necesidades del mapa SOS — integración manual por ahora
- Seguimiento longitudinal / múltiples visitas a la misma familia — v1 es registro del día

### Success definition
Una voluntaria termina una jornada sabiendo que los datos de cada familia que entrevistó quedaron guardados y accesibles para coordinación, sin pasar información por WhatsApp. Una coordinadora ve qué familias se censaron, cuáles tienen prioridad alta, y exporta la lista para seguimiento.

### MVP boundary
Formulario sociofamiliar en portal voluntaria (jornada activa) + deduplicación por cédula a nivel de grupo + advertencia de pérdida de borrador + vista lista/detalle/export CSV (solo coordinadoras). Online-first en v1.

---

## Acceptance criteria

- [ ] Given una voluntaria autenticada e inscrita en una jornada con sitio asignado, when abre «Nuevo censo» desde esa jornada, then ve el formulario mobile-first con los 7 bloques del docx (representante, vivienda, núcleo familiar, salud, apoyos, necesidades prioritarias, observaciones).
- [ ] Given el formulario de censo abierto, when intenta guardar sin nombre, cédula, edad, teléfono o parentesco del representante, then no se guarda y se indica qué falta; el correo puede quedar vacío.
- [ ] Given el formulario de censo abierto, when deja vacíos vivienda, núcleo familiar, salud, apoyos, necesidades, observaciones o prioridad/seguimiento, then puede guardar igual (campos opcionales).
- [ ] Given una voluntaria llenando el censo, when ingresa una cédula que ya existe en otro censo del mismo grupo (cualquier sitio o jornada), then ve un aviso de que ese documento ya aparece en el censo, con opción de ver el registro existente o continuar creando uno nuevo.
- [ ] Given una cédula que no existe en el grupo, when la voluntaria la ingresa, then no aparece aviso de duplicado y puede continuar el formulario.
- [ ] Given un censo guardado con éxito, when coordinación o la voluntaria lo consultan, then queda ligado a la jornada actual, al sitio de esa jornada y a la voluntaria que lo levantó; fecha, lugar y voluntaria responsable aparecen sin tipeo manual.
- [ ] Given una coordinadora en el panel de una jornada, when abre la lista de censos, then ve cada censo con nombre del representante, prioridad (Alta/Media/Baja si se indicó) y voluntaria que lo tomó.
- [ ] Given una coordinadora en esa lista, when abre un censo, then ve el detalle completo de los bloques capturados.
- [ ] Given una coordinadora autenticada del grupo, when exporta censos, then descarga un CSV; una voluntaria no tiene acción de exportar.
- [ ] Given la voluntaria con el formulario abierto y sin conexión (o fallo de red al guardar), when intenta guardar, then ve un aviso claro de que no se guardó y el formulario permanece para reintentar.
- [ ] Given la voluntaria entra al flujo de censo (o intenta salir / cerrar), when la UI muestra el flujo, then ve una advertencia de que los datos se pueden perder si cierra la pestaña o pierde conexión antes de guardar.

---

## Existing surfaces affected

| Surface | Change |
|---------|--------|
| `jornadas-eventos` | Entrada «Nuevo censo» / lista de censos desde jornada; sitio de la jornada como contexto |
| `tareas-inscripciones` | Solo voluntaria inscrita en la jornada puede capturar |
| `voluntarios-registro` | Sesión voluntaria identifica `voluntaria_id` en el censo |
| `sitios-catalogo` | `sitio_id` de la jornada asocia el censo al sitio visitado |
| `grupos-voluntarios-entidad` | Deduplicación y RLS scoped por `grupo` |
| `moderadoras-por-grupo` | Lista, detalle y export CSV solo coordinadoras/moderadoras |

## New capabilities required

| Capability | Description |
|------------|-------------|
| `censo-sociofamiliar-captura` | Formulario + persistencia + RPC/dedup por cédula en el grupo; portal voluntaria |
| `censo-sociofamiliar-panel-coord` | Lista/detalle por jornada + export CSV en panel coordinadora |

---

## Dependencies

| Feature | Status |
|---------|--------|
| `jornadas-eventos` | Shipped — jornadas con sitio |
| `tareas-inscripciones` | Shipped — inscripción / sesión voluntaria |
| `voluntarios-registro` | Shipped — censo de voluntarias |
| `sitios-catalogo` | Shipped — sitios por grupo |

Roadmap snapshot en product repo está vacío; estado tomado de `Context/capabilities-inventory.md` (piloto Cuidadoras Caracas).

---

## Mockup

No mockup. UX agent in ADWF pipeline (optional Phase B) si el formulario de 7 bloques necesita design notes; builder puede alinear con patrones mobile-first de `public/cuidadoras-caracas/`.

---

## Stack notes

- HTML/CSS/JS en `public/cuidadoras-caracas/` — sin build, sin framework (no React/Vite)
- Backend = Supabase; migraciones nuevas en `supabase/migrations/`
- Sin `localStorage` / `sessionStorage` en v1 — online-first; offline IndexedDB es Fase 2 explícita
- Sesión voluntaria: memoria + `window.name` (patrón existente)
- Formulario fuente: `Context/source-docs/Encuesta_Sociofamiliar_Madres_Cuidadoras_Voluntarias.docx`
- Dedup: match por documento de identidad normalizado dentro del `grupo` (no por distancia geográfica)
- Open question para planner/builder: PII de menores en tabla de núcleo familiar vs política previa de solo agregados en `sitios` — confirmar retención antes de persistir nombres de niños

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
| VG1 | ¿Campos obligatorios vs opcionales? | Representante: todos obligatorios excepto correo. Resto del formulario opcional. |
| VG2 | ¿Dedup por sitio o más amplio? | Por grupo (cualquier sitio/jornada del mismo grupo). |
| VG3 | ¿CSV vs vista agregada? | Solo export CSV; solo coordinadoras. Sin vista agregada en MVP. |
| VG4 | ¿Pérdida de borrador bloqueante? | No; advertir claramente que se pueden perder los datos. |

---

## Linked artifacts

scope_file: Features/censo-sociofamiliar-jornada/scope.yaml
mockup_file: null
source_form: Context/source-docs/Encuesta_Sociofamiliar_Madres_Cuidadoras_Voluntarias.docx
interview_ids:
  - 2026-07-05-voluntarias-cuidadoras-caracas
  - conversacion-censo-cuidadoras-caracas-2026-07-29
linear_issue_id: null
pr_url: null
