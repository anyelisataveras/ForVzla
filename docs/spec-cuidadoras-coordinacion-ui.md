# Spec UI — Coordinación Cuidadoras Caracas (ForVzla)

> **Propósito:** Documento de diseño para generar la interfaz con Claude Design e implementar después en ForVzla (HTML/CSS/JS inline, sin build).
>
> **Cliente piloto:** Madres Cuidadoras Voluntarias — subgrupo Caracas / La Guaira (~50 voluntarias de campo, ~180 en grupo general).
>
> **Estado actual:** Formulario de registro desplegado en `/cuidadoras-caracas`. Admin global con listado read-only + eliminar. **Falta** landing del grupo, panel de moderadoras, edición de voluntarias, jornadas, tareas, brigadas, RSVP, sitios e inventario.
>
> **Versión:** 1.1 (post-revisión 6 jul 2026)
>
> **Referencias:** `meetings/2026-07-05-voluntarias-cuidadoras-caracas.md` · `meetings/2026-07-06-revision-spec-cuidadoras-ui.md` · **`docs/spec-cuidadoras-user-stories.md`** (backlog priorizado) · `public/cuidadoras-caracas.html` · infograma 7 brigadas.

---

## 1. Resumen del producto

### Problema
La coordinación vive en WhatsApp: listas copiadas, confirmaciones enterradas, logística de transporte manual, y la coordinadora general (Ren) recibe demasiados mensajes.

### Solución
Un **espacio privado por grupo de voluntarios** (piloto: Cuidadoras Caracas; **plantilla reutilizable** para otros grupos) donde:
- **Moderadoras** mantienen el censo, crean jornadas, gestionan sitios, ven transporte y exportan resúmenes.
- **Coordinadoras de brigada** publican planificación y tareas concretas dentro de cada jornada.
- **Voluntarias** eligen sus brigadas, confirman asistencia a jornadas, se apuntan a tareas (“preparo comida”, “llevo donación”) e indican transporte.

### Tres conceptos (no mezclar)

| Concepto | Qué es | Ejemplo |
|----------|--------|---------|
| **Brigada** | Afiliación de largo plazo según interés/talento | “Logística de alimentos” — me apunto una vez |
| **Jornada** | Salida/actividad con fecha, lugar y misión | Martes 9 AM · Catia La Mar |
| **Tarea** | Acción concreta dentro de una jornada | “Preparar lonches”, “Llevar kits emocionales” |

### Principio rector
> WhatsApp para el ánimo, lo urgente y insistir cuando algo queda **sin dueño**. ForVzla para la **memoria, el calendario y los números**.

### Fuera de alcance (v1)
- **IA** para sugerir o asignar brigadas — la voluntaria elige; los requisitos son informativos, no bloqueantes.
- **Integración API WhatsApp** — solo exportar/copiar texto para pegar en el grupo.
- **Expedientes legales / PII de menores** — casos Yeudi/abogados: otro módulo si hay marco de seguridad definido.

### Misión operativa (post-pivot de Ren)
No solo buscar refugios con hambre urgente. Priorizar **recreación, contención emocional y respiro para las mamás** — visitando sitios donde aún tenga sentido ir (evitar duplicar ayuda que otras fundaciones ya cubrieron).

---

## 2. Usuarios y permisos

| Rol | Quién | Acceso |
|-----|-------|--------|
| **Voluntaria** | Registrada en el grupo | Login ligero; ver/editar sus brigadas; ver jornadas; confirmar asistencia; apuntarse a tareas; ver su número de carnet |
| **Coordinadora de brigada** | Una por brigada (designada por moderadoras) | Publicar tareas de su brigada en jornadas; ver quién se apuntó; marcar tareas sin dueño |
| **Moderadora** | Dari (stakeholder principal), Ren, Jeudy, Cindy (+ otras) | CRUD voluntarias, jornadas, sitios, brigadas; ver PII; exportar; asignar coordinadoras de brigada |
| **Admin ForVzla** | Equipo técnico | Admin global (`/admin.html`) — fuera de este spec salvo mención |

### Autenticación v1 (moderadoras)
- URL: `/cuidadoras-caracas/coord`
- Login con **correo + contraseña** (Supabase Auth, como `admin.html`) **o** token de grupo (`?access=...`) para despliegue rápido.
- RLS: `is_moderador_grupo('cuidadoras_caracas')` — no ven otros grupos ni el mapa SOS completo.
- **Stakeholder de validación UI:** Dari (post-implementación, no Yeudi en primera revisión de diseño).

### Autenticación v1 (voluntarias)
Sesión en memoria (sin `localStorage`). Credenciales del registro:
1. **Usuario de red social** que declararon (Instagram, X o Gmail) + **últimos 4 dígitos de cédula** como clave.
   - Ej.: plataforma `Gmail`, usuario `yrma@gmail.com`, clave `8922`.
   - Más difícil de adivinar que solo número de carnet.
2. **Link directo a jornada** (`/cuidadoras-caracas/jornada/{id}`) — pide login si no hay sesión; tras login vuelve a la jornada.
3. **Link personal** con token (`?v={token}`) — pre-llena identidad (fase 2).

Si falla → *"No te encontramos. Revisa usuario y cédula, o regístrate."* + link a registro.

### Brigadas — reglas de negocio
- La voluntaria **se apunta sola** a una o más brigadas (multi-select).
- Cada brigada muestra **características y requisitos sugeridos** (informativos).
- **No bloquear** inscripción si no cumple requisito (ej. ingeniera que quiere ayudar en alimentos).
- Puede ayudar en tarea de otra brigada si hace falta — no encasillar.
- **No usar IA** para recomendar brigada (descartado en revisión 6 jul).

---

## 3. Arquitectura de información y URLs

### Landing del grupo — `/cuidadoras-caracas`

El formulario de registro deja de ser la página principal. La landing ofrece **tres caminos**:

```
/cuidadoras-caracas                         → Landing del grupo (NUEVO)
├── [ Quiero ser voluntaria ]               → /cuidadoras-caracas/registro
├── [ Ya soy voluntaria — entrar ]          → /cuidadoras-caracas/entrar
└── [ Soy coordinadora ]                    → /cuidadoras-caracas/coord

/cuidadoras-caracas/registro                → Formulario 3 pasos (ya existe, movido)
/cuidadoras-caracas/entrar                  → Login voluntaria
/cuidadoras-caracas/mi-cuenta               → Mis brigadas + jornadas (post-login)
/cuidadoras-caracas/jornadas                → Lista jornadas (voluntaria logueada o pública)
/cuidadoras-caracas/jornada/{id}            → Detalle + RSVP + tareas
/cuidadoras-caracas/coord                   → Login moderadoras
/cuidadoras-caracas/coord/                  → Panel moderadoras (post-login)
  ├─ ?tab=inicio      → Dashboard
  ├─ ?tab=voluntarias → Censo + edición
  ├─ ?tab=brigadas    → Catálogo + coordinadoras
  ├─ ?tab=jornadas    → Crear / editar jornadas
  ├─ ?tab=sitios      → Lugares atendidos + cobertura
  └─ ?tab=exportar    → Copiar para WhatsApp / CSV
```

**Wireframe landing**
```
┌─────────────────────────────────────┐
│ 👩‍👧 Cuidadoras Caracas               │
│ Madres voluntarias · Caracas y       │
│ La Guaira                            │
├─────────────────────────────────────┤
│                                     │
│  [ 🙋 Quiero ser voluntaria ]       │
│                                     │
│  [ 💜 Ya soy voluntaria — entrar ]  │
│                                     │
│  [ ⚙️ Soy coordinadora ]            │
│                                     │
├─────────────────────────────────────┤
│ ← Volver a Ayuda Venezuela          │
└─────────────────────────────────────┘
```

**Links para WhatsApp:** jornada directa `…/jornada/{id}`; landing general `…/cuidadoras-caracas`.

**Alias cortos (fase 2):** `forvzla.org/cc` → landing del grupo.

---

## 4. Sistema de diseño (heredar de registro existente)

Usar **exactamente** los tokens de `cuidadoras-caracas.html` para coherencia de marca.

### Colores
| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#F1EEEA` | Fondo página |
| `--surf` | `#FBFAF8` | Cajas internas |
| `--ind` | `#5A4AA0` | Primario (header, CTAs moderador) |
| `--indh` | `#4A3C88` | Hover primario |
| `--indl` | `#EEEBF6` | Fondos seleccionados |
| `--indt` | `#463A82` | Texto sobre tinte |
| `--grn` | `#1E8449` | Éxito, "Voy", confirmada |
| `--grnl` | `#E9F6EE` | Fondo éxito |
| `--red` | `#C0392B` | Error, alerta transporte |
| `--redl` | `#FBEDEA` | Fondo error |
| `--txt` | `#1C1A19` | Texto principal |
| `--txt2` | `#6B6560` | Secundario |
| `--txt3` | `#9A938B` | Terciario / labels |
| `--line` | `#E7E2DB` | Bordes |
| `--line2` | `#E2DCD4` | Bordes inputs |

### Colores por brigada (infograma — badges y chips)
| Brigada | Color fondo | Color texto |
|---------|-------------|-------------|
| Logística de alimentos | `#D6EAF8` | `#1A5276` |
| Salud y medicamentos | `#D5F5E3` | `#186A3B` |
| Clasificación de donaciones | `#FCF3CF` | `#7D6608` |
| Saneamiento y mantenimiento | `#FAE5D3` | `#A04000` |
| Atención directa y recreación | `#FADBD8` | `#922B21` |
| Contención emocional y resguardo | `#E8DAEF` | `#6C3483` |
| Brigada social | `#D1F2EB` | `#117A65` |

### Tipografía y layout
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
- Tamaño base: `16px` (evitar zoom iOS en inputs)
- Ancho máximo app voluntaria: `580px` centrado
- Ancho máximo panel moderadoras (tablet+): `960px`; en móvil, mismo `580px` con tabs inferiores
- Border radius cards: `18px`; inputs/botones: `10–12px`
- Mobile-first, un pulgar, alto contraste
- `prefers-reduced-motion`: sin animaciones decorativas

### Componentes reutilizables
| Componente | Descripción |
|------------|-------------|
| `Header` | Barra `--ind`, título blanco, subtítulo 13px opacity 0.88, link "← Ayuda Venezuela" |
| `Card` | Fondo blanco, borde `--line`, sombra suave |
| `BtnPrimary` | `--ind`, texto blanco, peso 800 |
| `BtnSuccess` | `--grn` — RSVP "Voy" |
| `BtnSecondary` | Blanco, borde `--line2` |
| `BtnDanger` | Outline rojo — eliminar |
| `Field` | Label 12px bold `--txt2`, input full width |
| `Chip` | Pill selectable para brigadas/filtros |
| `Badge` | Estado pequeño (abierta, llena, realizada, **sin dueño**) |
| `TaskRow` | Tarea de jornada con avatar de responsable o alerta "Sin dueño" |
| `Stat` | Número grande + label — dashboard transporte |
| `Toast` | Negro abajo, mensaje breve |
| `Empty` | Ilustración emoji + texto + CTA |
| `BottomNav` | Solo panel coord: 5 íconos (solo móvil) |

---

## 5. Modelo de datos (referencia para UI)

### 5.0 `grupos_voluntarios` (entidad raíz)

Todo el módulo cuelga de un **grupo**. Administrable en **Admin ForVzla → tab Grupos**.

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `slug` | text PK | `cuidadoras_caracas` |
| `nombre` | text | Cuidadoras Caracas |
| `descripcion` | text | Madres voluntarias… |
| `ruta_web` | text | `cuidadoras-caracas` → `/cuidadoras-caracas` |
| `activo` | boolean | desactivar sin borrar datos |

**Hijos con FK a `slug`:** `voluntarios`, `brigadas`, `sitios`, `jornadas`, `moderadores_grupo`.  
`inscripciones` y `tareas_jornada` heredan grupo vía `jornada_id`.

**UI:** cada carpeta `public/{ruta_web}/` fija `window.CC_GRUPO_SLUG` en sus HTML. Nuevo grupo = nuevo slug en Admin + desplegar páginas con ese slug.

### 5.1 `voluntarios` (existente — ampliar)

Campos actuales + **nuevos**:

| Campo | Tipo | UI registro | UI moderadora |
|-------|------|-------------|---------------|
| `numero_voluntaria` | serial | Mostrar al final | Solo lectura |
| `nombre`, `apellido` | text | Sí | Editable |
| `edad` | smallint | Sí | Editable |
| `estado_civil` | text | Opcional (revisar quitar) | Editable |
| `id_dni` | text | Sí | Editable (validar único por grupo) |
| `telefono` | text | Sí con intl-tel | Editable |
| `pais`, `estado_provincia`, `ciudad`, `direccion` | text | Sí | Editable |
| `red_social_plataforma`, `red_social_usuario` | text | Sí | Editable |
| `profesion`, `oficio` | text | Sí | Editable |
| `disponibilidad` | text | Sí | Editable |
| `tiene_hijos`, `hijos` | jsonb | Sí | Editable |
| `tareas`, `fortalezas` | text | Sí | Editable |
| `asistencia_zona` | text | Sí | Editable — Caracas / La Guaira / Ccs o La Guaira |
| `medio_transporte` | enum | Sí | Editable — sin_transporte / carro / camioneta / moto |
| `observaciones_logistica` | text | Sí | Editable |
| **`brigadas`** | text[] | **Nuevo** multi-select (autoadscripción) | Editable |
| **`login_usuario`** | text | Derivado de `red_social_usuario` | Solo lectura — usado en auth |
| **`foto_url`** | text | Opcional fase 2 | Para carnet digital |
| **`activa`** | boolean | — | Toggle moderadora (baja lógica) |
| **`notas_internas`** | text | — | Solo moderadoras |

### 5.2 `brigadas` (catálogo por grupo)

| id | slug | nombre | misión | requisitos (informativos) | coordinador_voluntario_id | icono |
|----|------|--------|--------|---------------------------|---------------------------|-------|
| 1 | logistica_alimentos | Logística de Alimentos | Preparar y distribuir comidas | Experiencia en cocina deseable | nullable FK | 🍲 |
| 2 | salud_medicamentos | Salud y Medicamentos | Atención médica segura | Profesión salud o experiencia | nullable FK | 💊 |
| 3 | clasificacion_donaciones | Clasificación de Donaciones | Inventario de ropa y kits | Ninguno | nullable FK | 📦 |
| 4 | saneamiento | Saneamiento y Mantenimiento | Espacios habitables | Ninguno | nullable FK | 🧹 |
| 5 | recreacion | Atención Directa y Recreación | Juegos, deporte, cultura | Experiencia con niños deseable | nullable FK | ⚽ |
| 6 | contencion | Contención Emocional y Resguardo | Apoyo psicoafectivo | Formación psico/sociales deseable | nullable FK | 💜 |
| 7 | social | Brigada Social | Casos vulnerables, enlace | Ninguno | nullable FK | 🤝 |

**UI coordinadora de brigada:** desde panel moderadoras o vista reducida si solo coordina una brigada — publica tareas en jornadas de su brigada.

### 5.3 `sitios` (lugares a atender)

| Campo | Tipo | Ejemplo UI |
|-------|------|------------|
| `id` | uuid | — |
| `grupo` | text | cuidadoras_caracas |
| `nombre` | text | "Campamento La California" |
| `alias` | text | "Prefieren llamarlo campamento" |
| `zona` | text | La Guaira |
| `direccion` | text | Referencia para logística |
| `lat`, `lng` | float | Opcional — pin en mapa mini |
| `personas_afectadas` | int | Total personas si aplica |
| **`ninos_total`** | int | 115 — total niños en el sitio |
| **`ninas`** | int | 45 |
| **`ninos_varones`** | int | 70 (niños masculino) |
| **`neodivergentes`** | int | 3 (subconjunto; sin nombres) |
| `ninos_aprox` | int | *deprecated → usar desglose arriba* |
| `contacto_nombre` | text | Solo moderadoras |
| `contacto_telefono` | text | Solo moderadoras |
| `permiso_verificado` | boolean | Jeudy marcó permiso |
| `cobertura_comida` | enum | ninguna / baja / ok / sobra |
| `cobertura_medicinas` | enum | idem |
| `cobertura_cotillon` | enum | idem |
| `cobertura_recreacion` | enum | idem |
| `ultima_visita_at` | timestamptz | Auto al cerrar jornada |
| `notas` | text | "Ya tienen comida de otra ONG" |
| `ayuda_duplicada` | boolean | true si otro equipo ya cubrió — evitar viaje perdido |
| `activo` | boolean | |

**Retroalimentación de campo (obligatorio al cerrar jornada):** moderadora o voluntaria reporta si el sitio ya tenía ayuda suficiente → actualiza cobertura y `ayuda_duplicada`.

### 5.4 `jornadas` (actividades / salidas)

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `id` | uuid | — |
| `grupo` | text | cuidadoras_caracas |
| `titulo` | text | "Jornada recreación — Catia La Mar" |
| `sitio_id` | uuid FK | Opcional si sitio nuevo inline |
| `fecha` | date | 2026-07-07 |
| `hora_salida` | time | 09:00 |
| `hora_encuentro` | time | 08:30 |
| `punto_encuentro` | text | Plaza Venezuela |
| `hora_regreso_aprox` | time | 14:00 |
| `descripcion` | text | Misión con los niños… |
| `brigadas` | text[] | recreacion, contencion |
| `vestimenta` | text | Franela negra, jeans, gomas |
| `llevar` | text | Carnet, agua |
| `meta_voluntarias` | int | 10 |
| `meta_vehiculos` | int | 2 |
| `estado` | enum | borrador / abierta / llena / realizada / cancelada |
| `creada_por` | text | email moderadora |
| `notas_internas` | text | — |
| `created_at` | timestamptz | — |

### 5.5 `tareas_jornada` (acciones concretas — pueden quedar sin dueño)

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `id` | uuid | — |
| `jornada_id` | uuid FK | — |
| `brigada_slug` | text | logistica_alimentos |
| `titulo` | text | "Preparar lonches" |
| `descripcion` | text | "Para 30 niños" |
| `cupos` | int | 2 |
| `voluntario_id` | uuid FK nullable | Quien se apuntó (null = sin dueño) |
| `estado` | enum | sin_dueno / asignada / completada |
| `creada_por` | text | email coordinadora brigada o moderadora |

**UI:** tareas `sin_dueno` destacadas en rojo/naranja — botón moderadora *"Copiar aviso para WhatsApp"*.

### 5.6 `necesidades_jornada` (checklist materiales / inventario)

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `jornada_id` | uuid | — |
| `item_nombre` | text | "Kits emocionales" — autocompletado desde catálogo |
| `descripcion` | text | "Kits emocionales" |
| `cantidad_necesaria` | int | 20 |
| `cantidad_conseguida` | int | 15 |
| `estado` | enum | pendiente / parcial / cubierta |
| `donante_notas` | text | "Alida: muletas niño nuevas" |

**Catálogo `items_inventario` (fase 2):** lista reutilizable por grupo (cotillones, juguetes, primeros auxilios…). Al escribir, autocompletar para no duplicar nombres. Medicamentos: texto libre (sin inventario estructurado v1).

### 5.7 `inscripciones` (RSVP a jornada)

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `jornada_id` | uuid | — |
| `voluntario_id` | uuid | — |
| `estado` | enum | pendiente / confirmada / no_puede / asistio / no_asistio |
| `necesita_transporte` | boolean | true |
| `ofrece_transporte` | boolean | false |
| `cupos_ofrecidos` | int | 0 o 2 |
| `brigada_asignada` | text | recreacion |
| `notas` | text | "Llego tarde, me incorporo en ruta" |
| `respondido_at` | timestamptz | — |

| `respondido_at` | timestamptz | — |

### 5.8 `tareas_inscripciones` (opcional v1 — o campo en tareas_jornada)

Relación N:1 si una tarea admite varias personas (`cupos` > 1). Alternativa v1: una fila por tarea con un solo `voluntario_id`.

---

## 6. Pantallas — Voluntaria

### 6.0 Login — `/cuidadoras-caracas/entrar`

```
← Volver

💜 Ya soy voluntaria

Red social que usaste al registrarte
[ Instagram ▼ ]

Tu usuario / correo
[ @yrma_cuida                    ]

Últimos 4 dígitos de tu cédula
[ ••••8922                       ]

[ Entrar ]

¿Primera vez? Regístrate aquí
```

Tras login → `/cuidadoras-caracas/mi-cuenta` o redirect a jornada si venía de link WA.

### 6.1 Mi cuenta — `/cuidadoras-caracas/mi-cuenta`

```
Hola, Yrma 👋
Voluntaria N° 4

━━ Mis brigadas ━━
Elegiste dónde quieres colaborar. Puedes cambiar cuando quieras.

[🍲 Logística alimentos ✓] [⚽ Recreación ✓] [💜 Contención]
[ + Apuntarme a otra brigada ]

Cada chip muestra requisitos sugeridos al tocar (ℹ️).
No te bloqueamos si no los cumples.

━━ Próximas jornadas ━━
( lista igual que 6.2 )

[ Ver todas las jornadas ]
[ Cerrar sesión ]
```

### 6.2 Lista de jornadas — `/cuidadoras-caracas/jornadas`

**Header**
```
← Ayuda Venezuela
👩‍👧 Cuidadoras Caracas
Próximas jornadas en Caracas y La Guaira
```

**Contenido**
- Si no hay jornadas abiertas → `Empty`: emoji 📅, *"No hay jornadas programadas por ahora. El grupo te avisará por WhatsApp."*
- Lista de cards ordenadas por fecha asc:

**Card jornada (compacta)**
```
┌─────────────────────────────────────┐
│ 🗓 Mar 7 jul · 9:00 AM              │
│ Catia La Mar, La Guaira             │
│ [Recreación] [Contención]           │  ← chips brigada
│ 🟢 Abierta · 9 confirmadas          │
│                    [ Ver y confirmar ] │
└─────────────────────────────────────┘
```

Estados badge:
- `borrador` — no visible para voluntarias
- `abierta` — 🟢 Abierta
- `llena` — 🟠 Cupo lleno (aún puede ver, RSVP deshabilitado salvo lista espera fase 2)
- `realizada` — gris, "Realizada el 7 jul"
- `cancelada` — tachado, "Cancelada"

**Footer**
- Sin sesión: *"Entra con tu usuario y cédula"* + link
- Link registro: *"¿Primera vez? Regístrate"*

---

### 6.3 Detalle jornada + RSVP + tareas — `/cuidadoras-caracas/jornada/{id}`

**Si no hay sesión** → pantalla login (6.0) con return URL a esta jornada.

**Tras identificar — hero**
```
Hola, Yrma 👋
Voluntaria N° 4
```

**Detalle jornada**
```
🗓 Martes 7 de julio de 2026

⏰ Encuentro 8:30 AM — Plaza Venezuela
🚐 Salida 9:00 AM hacia Catia La Mar
🏠 Regreso ~2:00 PM

━━ Misión ━━
Llevamos recreación a los niños: pinta caritas,
cuentos y dinámicas. Brindar respiro a las mamás.

Brigadas: [Recreación] [Contención emocional]

👕 Vestimenta: franela negra, jeans, gomas
🎒 Llevar: carnet, agua

━━ Tareas de esta jornada ━━
Apúntate a lo que puedas hacer:

│ ⚠️ Preparar lonches (Logística)     [ Yo me encargo ] │
│ ✅ Pinta caritas — Kelly             (cubierta)       │
│ ⚠️ Llevar kits emocionales           [ Yo me encargo ] │
│ ⚠️ Acompañar lectura (Recreación)    SIN DUEÑO        │

━━ Tu asistencia ━━
( ) ✅ Voy
( ) No puedo esta vez

□ Necesito transporte
□ Puedo llevar personas en mi vehículo
   Cupos: [ 2 ▼]

Notas (opcional): [________________]

[ Guardar respuesta ]
```

**Estados después de guardar**
- Toast: *"Listo, quedaste confirmada para el martes 💜"*
- Mostrar resumen readonly + botón *"Cambiar respuesta"* (hasta 2h antes de salida, configurable)

**Si ya confirmó antes**
- Banner verde: *"Confirmaste el 6 jul a las 2:10 AM"*
- Mismos controles editables

---

## 7. Pantallas — Moderadoras

### 7.0 Login — `/cuidadoras-caracas/coord`

```
👩‍👧 Coordinación
Cuidadoras Caracas

Correo: [________________]
Contraseña: [________________]
[ Entrar ]

Solo para coordinadoras autorizadas.
```

Mismo estilo visual que registro; sin link público en home del mapa SOS.

---

### 7.1 Layout panel moderadoras (post-login)

**Desktop / tablet**
```
┌──────────────────────────────────────────────────┐
│ 👩‍👧 Coordinación · Cuidadoras Caracas    [Salir] │
├──────────┬───────────────────────────────────────┤
│ Inicio   │  (contenido del tab activo)           │
│ Volunt.  │                                       │
│ Brigadas │                                       │
│ Jornadas │                                       │
│ Sitios   │                                       │
│ Exportar │                                       │
└──────────┴───────────────────────────────────────┘
```

**Móvil**
- Header fijo + contenido + **BottomNav** 5 íconos (Inicio, Voluntarias, +, Jornadas, Más)
- FAB central **+** → "Nueva jornada" (acción más frecuente)

---

### 7.2 Tab Inicio (Dashboard)

**Bloque 1 — Próxima jornada** (si existe)
```
PRÓXIMA JORNADA
Martes 7 jul · Catia La Mar · 9:00 AM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  9        3         4         ⚠️ 1
confirmadas  sin ride  cupos     falta ride
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ Ver detalle ]  [ Copiar para WhatsApp ]
```

Lógica alerta transporte:
- `sin_transporte` = inscripciones confirmadas con `necesita_transporte=true`
- `cupos` = suma de `cupos_ofrecidos` donde `ofrece_transporte=true`
- Alerta roja si `cupos < sin_transporte`

**Bloque 2 — Acciones rápidas** (grid 2×2)
| Botón | Acción |
|-------|--------|
| + Nueva jornada | → form crear |
| Ver voluntarias sin registro | filtro pre-aplicado |
| Agregar sitio | → form sitio |
| Link registro | copiar URL formulario |

**Bloque 3 — Resumen censo**
```
87 voluntarias registradas · 12 con vehículo · 4 pendientes de completar registro
```

---

### 7.3 Tab Voluntarias — listado

**Toolbar**
```
[ 🔍 Buscar nombre, cédula, tel…     ]
Filtros: [Todas ▼] [Con vehículo] [Sin registro completo] [Zona: Ccs ▼]
[ + Agregar voluntaria manual ]
```

**Fila / card voluntaria**
```
┌─────────────────────────────────────────────────┐
│ #4 · Yrma la Cruz                    [Activa ✓] │
│ V-12.345.892 · 0414-1234567                     │
│ Ccs o La Guaira · Sin transporte                │
│ [Recreación] [Contención]                       │
│ Última jornada: —                                 │
│        [ Editar ]  [ Ver historial ]  [ ··· ]   │
└─────────────────────────────────────────────────┘
```

Menú `···`: Desactivar · Eliminar (confirmación doble)

**Indicadores**
- Borde izquierdo **rojo** si falta teléfono o datos críticos (lista "en rojo" de Dari)
- Ícono 🚗 si tiene carro/camioneta/moto
- Gris si `activa=false`

---

### 7.4 Editar voluntaria (modal full-screen móvil / panel lateral desktop)

**Título:** `Editar · #4 Yrma la Cruz`

Organizar en **3 secciones colapsables** (mismas que formulario registro):

**A. Datos personales**
- Nombre *, Apellido *, Edad, Estado civil
- Cédula * (warning si cambia y choca con otra)
- Teléfono * (intl-tel-input)
- País, Estado, Ciudad, Dirección

**B. Profesión y logística**
- Red social (select + usuario)
- Profesión *, Oficio
- Disponibilidad (select + "Otros")
- ¿Hijos? + lista dinámica sexo/edad
- Zona asistencia (select)
- Medio transporte (select)
- Observaciones logística (textarea)

**C. Brigadas y notas**
- Brigadas (multi-select chips — mismas que ve la voluntaria en su cuenta)
- Al seleccionar brigada: tooltip con requisitos **informativos**
- Tareas, Fortalezas (textarea)
- **Notas internas** (solo moderadoras): "Pide permiso en trabajo los martes"
- Toggle **Activa**

**Footer fijo**
```
[ Cancelar ]  [ Guardar cambios ]
```

**Validaciones**
- Cédula única en grupo
- Teléfono válido
- Si desactiva → no borra historial de inscripciones

---

### 7.5 Agregar voluntaria manual (moderadora)

Mismo formulario que edición, pre-llenado vacío.
- Checkbox: *"Enviar link de registro a esta persona"* (fase 2 — copia WA con número asignado)
- Al guardar: asigna `numero_voluntaria` automático
- No requiere declaración jurada si la crea moderadora (`declaracion_jurada=true` implícito)

---

### 7.6 Tab Brigadas — catálogo y coordinadoras

```
BRIGADAS DEL GRUPO
━━━━━━━━━━━━━━━━━━

🍲 Logística de Alimentos
   Coordinadora: Cindy (#2)        [ Cambiar ]
   12 voluntarias · 3 jornadas activas

⚽ Recreación
   Sin coordinadora asignada         [ Asignar ]
   28 voluntarias

[ Ver voluntarias por brigada ]
```

Acciones: asignar coordinadora (select voluntaria activa), ver miembros, filtrar jornadas de esa brigada.

---

### 7.7 Tab Jornadas — listado

**Toolbar**
```
[ + Nueva jornada ]
Pestañas: [ Próximas ] [ Pasadas ] [ Borradores ]
```

**Card jornada (moderadora)**
```
┌─────────────────────────────────────────────────┐
│ Martes 7 jul · 9:00 · Catia La Mar    [Abierta] │
│ 9 / 10 voluntarias · ⚠️ transporte              │
│ Recreación, Contención                            │
│ [ Editar ] [ RSVP ] [ Cerrar jornada ] [ ··· ]  │
└─────────────────────────────────────────────────┘
```

---

### 7.8 Crear / editar jornada (formulario)

**Paso único scroll** (no wizard — moderadoras con prisa)

```
Nueva jornada
━━━━━━━━━━━━━━

Título *
[ Jornada recreación — Catia La Mar          ]

Sitio
( ) Seleccionar existente [ La California ▼ ]
( ) Nuevo sitio rápido: [ nombre ] [ zona ]

Fecha *          Hora salida *
[ 07/07/2026 ]   [ 09:00 ]

Punto encuentro    Hora encuentro
[ Plaza Venezuela ] [ 08:30 ]

Hora regreso aprox.
[ 14:00 ]

Brigadas necesarias *
[🍲][💊][📦][🧹][⚽✓][💜✓][🤝]  ← multi chip

Descripción / misión
[ Llevamos recreación a los niños…           ]

Vestimenta
[ Franela negra, jeans, gomas                ]

Qué llevar
[ Carnet, agua                               ]

Metas (opcional)
Voluntarias: [10]   Vehículos: [2]

Estado
( ) Borrador  (•) Abierta  ( ) Cancelada

━━ Tareas de la jornada ━━
[ + Agregar tarea ]
│ Preparar lonches · Logística · 1 persona  [sin dueño] [editar] │
│ Pinta caritas · Recreación · Kelly        [asignada]          │
│ Llevar kits · Logística · 2 cupos         [sin dueño]         │

━━ Materiales / necesidades ━━
[ + Agregar ítem ]  (autocompletado catálogo — fase 2)
│ Kits emocionales    15/20  [✓][✗][ editar ] │
│ Pinta caritas       0/1    pendiente         │

[ Guardar ]  [ Guardar y copiar link WhatsApp ]
```

**Al guardar "copiar link"**
Genera texto:
```
✨ Jornada Cuidadoras — Martes 7 jul
📍 Catia La Mar · Salida 9 AM (encuentro Plaza Venezuela 8:30)
Confirmen aquí: https://forvzla.org/cuidadoras-caracas/jornada/xxx
```

---

### 7.9 Detalle jornada — vista moderadora

**Tabs internos:** Resumen | Confirmadas | Transporte | Necesidades

#### Tab Confirmadas
Tabla / lista:
| # | Nombre | Tel | Brigada | Estado | Transporte | Notas |
|---|--------|-----|---------|--------|------------|-------|
| 4 | Yrma | 0414… | Recreación | ✅ | Necesita | — |
| 8 | Kelly | 0424… | Recreación | ✅ | — | — |
| — | Martha | … | — | ❌ No puede | — | Trabajo |

Acciones por fila: Cambiar brigada · Marcar asistió · WhatsApp (link `wa.me`)

#### Tab Transporte (vista Cindy)
```
RESUMEN TRANSPORTE
━━━━━━━━━━━━━━━━━━
Necesitan ride: 3          Cupos disponibles: 4
Estado: ✅ Cubierto (sobra 1)

SIN TRANSPORTE (3)
• Yessica — 0412…
• Natascha — 0426…
• Claudia — 0414…

CON VEHÍCULO (2)
• Arlet — Carro — 2 cupos
• (buscar otra…) — Camioneta — 3 cupos

[ Copiar lista transporte para WhatsApp ]
```

**Tabs internos:** Resumen | Confirmadas | Transporte | Tareas | Materiales

#### Tab Tareas
```
TAREAS — 2 sin dueño ⚠️

│ Preparar lonches    Logística    SIN DUEÑO    [ Copiar aviso WA ] │
│ Pinta caritas       Recreación   Kelly        [ Reasignar ]       │
│ Llevar kits         Logística    SIN DUEÑO    [ Copiar aviso WA ] │

[ + Agregar tarea ]
```

Texto copiar para WA (tarea sin dueño):
```
Chicas — para el martes en La Guaira falta alguien que prepare los lonches.
¿Quién se apunta? 👉 forvzla.org/cuidadoras-caracas/jornada/xxx
```

#### Tab Materiales
Checklist editable inline (necesidades_jornada).

#### Cerrar jornada
Modal:
```
¿Marcar jornada como realizada?
□ Actualizar cobertura del sitio (recreación → ok)
□ El sitio ya tenía ayuda suficiente (evitar repetir visita)
□ Registrar quién asistió
[ Confirmar cierre ]
```

---

### 7.10 Tab Sitios — listado

**Card sitio**
```
┌─────────────────────────────────────────────────┐
│ La California · Caracas              [Activo]   │
│ ~45 personas · ~20 niños                        │
│ Comida: sobra · Recreación: baja · Meds: ok     │
│ Última visita: 8 jul 2026                       │
│ Permiso: ✓ Verificado (Jeudy)                   │
│              [ Editar ] [ Nueva jornada aquí ]  │
└─────────────────────────────────────────────────┘
```

**Mini indicadores cobertura** (4 iconos con color):
- 🔴 ninguna / baja
- 🟡 parcial (solo fase 2)
- 🟢 ok / sobra

---

### 7.11 Crear / editar sitio

```
Nombre del lugar *
[ Campamento La California ]

Cómo les gusta que lo llamen
[ Campamento (no refugio) ]

Zona *          Personas afectadas
[ Caracas ]     [ 45 ]

Niños (aprox., sin nombres)
[ 20 ]

Dirección / referencia
[ … ]

Contacto (solo coordinadoras)
Nombre: [___]  Tel: [___]

Permiso de entrada verificado
[✓] Jeudy confirmó

Cobertura actual
Comida:      [ sobra ▼ ]
Medicinas:   [ ok ▼ ]
Cotillón:    [ baja ▼ ]
Recreación:  [ baja ▼ ]

Notas
[ Ya reciben comida de otra fundación los martes ]

Cobertura actual
Comida:      [ sobra ▼ ]
Medicinas:   [ ok ▼ ]
Cotillón:    [ baja ▼ ]
Recreación:  [ baja ▼ ]

□ Otro equipo ya cubrió la ayuda principal (marcar para no repetir visita)

Notas
[ Ya reciben comida de otra fundación los martes ]

[ Guardar ]
```

**Confidencialidad:** datos de contacto y ubicación exacta solo visibles para moderadoras logueadas.

---

### 7.12 Tab Exportar

```
EXPORTAR PARA WHATSAPP
━━━━━━━━━━━━━━━━━━━━━━

( ) Resumen próxima jornada
( ) Lista confirmadas con teléfonos
( ) Solo transporte
( ) Tareas sin dueño
( ) Voluntarias sin registro completo
( ) Censo completo (CSV — solo moderadoras)

[ Generar texto ]  [ Descargar CSV ]

Preview:
┌────────────────────────────────────┐
│ CHICAS — Martes 7 jul La Guaira    │
│ Confirmadas (9):                   │
│ 1. Cyndi · 0414… · tiene ride      │
│ …                                  │
└────────────────────────────────────┘
[ 📋 Copiar ]
```

---

## 8. Flujos de usuario (diagramas)

### 8.1 Voluntaria — flujo completo
```
Landing → Entrar (usuario red social + 4 dígitos cédula)
  → Mi cuenta (brigadas) → Jornada → Voy/No + tareas "Yo me encargo"
  → Toast éxito
```

### 8.2 Voluntaria desde WhatsApp
```
Link jornada → Login si hace falta → Detalle → RSVP + tareas → Guardar
```

### 8.3 Moderadora crea jornada y recluta
```
Panel → Nueva jornada → Tareas + materiales → Guardar y copiar link
  → Pegar en WA → Voluntarias confirman → Dashboard transporte
  → Tareas sin dueño → Copiar aviso WA → Cindy coordina transporte
```

### 8.4 Coordinadora de brigada publica tareas
```
Jornada abierta → Agregar tareas de su brigada → Voluntarias se apuntan
  → Si sin dueño → moderadora/coord. insiste por WA
```

### 8.5 Dari actualiza censo
```
Panel → Voluntarias → Buscar "Yrma" → Editar
  → Completar teléfono / brigadas → Guardar
  → Desaparece borde rojo "sin registro"
```

### 8.6 Cierre de jornada + memoria institucional
```
Jornada realizada → Cerrar → Marcar asistencia + cobertura sitio
  → Si ayuda ya existía → marcar ayuda_duplicada
  → Sitio actualizado para próximas planificaciones
```

---

## 9. Estados, vacíos y errores

| Situación | Mensaje UI |
|-----------|------------|
| Login voluntaria fallido | *"Usuario o cédula incorrectos. Revisa los datos o regístrate."* |
| Cédula no encontrada | *"No te encontramos. Si aún no te registras, usa el formulario."* |
| Jornada llena | *"Cupo completo. Escríbele a la coordinadora si aún quieres ir."* |
| Tarea ya tomada | *"Otra voluntaria ya se apuntó. Elige otra tarea."* |
| Sin conexión | *"Sin internet. Intenta cuando tengas señal."* |
| Error guardar | *"No se pudo guardar. Intenta de nuevo."* + reintento |
| Moderadora sin permiso | *"No tienes acceso a este grupo."* |
| Voluntaria duplicada al crear | *"Ya existe una voluntaria con esa cédula (#12)."* |

---

## 10. Copy y tono

- **Español venezolano**, claro, cálido, sin jerga técnica
- Tratar a las usuarias de **tú** en UI voluntaria; moderadoras pueden usar tono más operativo
- Evitar: "RSVP", "dashboard", "CRUD" en UI — usar: *"Confirmar"*, *"Inicio"*, *"Guardar"*
- Nombre del módulo visible: **"Jornadas"** o **"Coordinación"** — no "módulo de voluntarios"
- Frase inspiracional (opcional footer voluntaria): *"Llevamos amor — ayudemos a los niños a ser niños"* (cita Ren)

---

## 11. Accesibilidad y mobile

- Tap targets mínimo 44×44px
- Focus visible en todos los controles
- Labels en todos los inputs
- Contraste WCAG AA en texto y botones
- Formularios: `inputmode`, `autocomplete` donde aplique
- No usar `localStorage` / `sessionStorage` — sesión moderadora vía Supabase Auth en memoria
- Funcionar en 3G lento: skeleton loaders, sin imágenes pesadas

---

## 12. Relación con ForVzla existente

| Sistema | Relación |
|---------|----------|
| Mapa SOS (`index.html`) | Independiente. Link "← Ayuda Venezuela". **Scraper/rescates:** depriorizado; se mantiene vivo por urgencias. |
| `necesidades` públicas | No mezclar tablas. Fase 3: desde sitio, "Reportar necesidad al mapa" |
| Admin global | Tab Voluntarias read-only; panel coord es herramienta del grupo |
| Registro | En `/cuidadoras-caracas/registro`; landing es entrada principal |
| WhatsApp | **Sin integración API v1.** Deciden en ForVzla; comunican por WA. Exportar/copiar texto sí. |
| Web Firestore (Dari) | Reemplazada por ForVzla/Supabase — no mantener en paralelo |
| Otros grupos (futuro) | Misma plantilla: bomberos USB, redes de profesionales, etc. |

### Proceso de entrega acordado
1. Diseño en Claude Design (este spec)
2. Revisión Angélisa + Cris **antes** de implementar
3. Implementación en ForVzla
4. Demo y validación con **Dari** (stakeholder principal)

---

## 13. Fases de implementación

> **Backlog detallado:** ver `docs/spec-cuidadoras-user-stories.md` (IDs `CC-###`, prioridades P0–P3, sprints sugeridos).

### Fase 1 — Sprint 0: Censo coordinadoras (P0, ahora)
- [ ] CC-110 RLS moderadoras
- [ ] CC-004 Login moderadora
- [ ] CC-001 Landing 3 caminos
- [ ] CC-002 Formulario en `/registro` + copiar link desde panel
- [ ] CC-010 Listar y buscar voluntarias
- [ ] CC-011 Editar voluntaria

### Fase 2 — Sprint 1: Jornadas y RSVP (P1)
- [ ] Login voluntaria, jornadas, RSVP, transporte, tareas
- [ ] Ver `docs/spec-cuidadoras-user-stories.md` Sprint 1
- [ ] Mi cuenta — gestión de brigadas por voluntaria
- [ ] Tab Brigadas + coordinadoras
- [ ] Sitios + cobertura + `ayuda_duplicada`
- [ ] Materiales / necesidades jornada
- [ ] Cierre jornada + asistencia + retroalimentación sitio
- [ ] Export CSV
- [ ] Brigadas en formulario registro público
- [ ] Catálogo ítems con autocompletado

### Fase 3
- [ ] Carnet digital con foto
- [ ] Link personal por voluntaria (`?v=token`)
- [ ] Puente con mapa SOS
- [ ] Segundo grupo piloto (plantilla reutilizable)

### Explícitamente fuera de roadmap
- IA para sugerir brigadas
- Integración WhatsApp Business API
- Inventario estructurado de medicamentos (dosis, vencimiento)
- Expedientes legales / menores (módulo Yeudi — requiere marco aparte)

---

## 14. Instrucciones para Claude Design

**Handoff recibido (6 jul 2026):** `handoff/cuidadoras-design/handoff-cursor/`
- Abrir `Coordinacion Cuidadoras.dc.html` en navegador (junto con `support.js`)
- Menú **☰ Pantallas** (abajo derecha) para navegar el prototipo
- Ver `HANDOFF.md` en esa carpeta

Al generar el UI, producir:

1. **Pantallas prioritarias** (mobile 390×844):
   - **Landing** del grupo (3 caminos) — **NUEVA, prioridad alta**
   - Login voluntaria (red social + cédula)
   - Mi cuenta (brigadas + jornadas)
   - Detalle jornada + RSVP + **tareas sin dueño**
   - Dashboard inicio (moderadora)
   - Lista voluntarias + editar voluntaria (moderadora)
   - *(bonus)* Crear jornada con tareas, Tab transporte, Tab tareas sin dueño

2. **1 pantalla desktop** (1280px): panel moderadoras con sidebar (incl. tab Brigadas)

3. **Design system page**: colores, tipografía, botones, chips brigadas, badges estado, **estado sin dueño** (naranja/rojo)

4. **Componentes**: Header, Card, BottomNav, Stat blocks, Transport alert, **TaskRow**, LandingCTA

5. Respetar tokens sección 4; sensación **cálida y organizada**, no corporativa fría

6. Iconografía: emoji aceptable (coherente con app actual)

7. No inventar PII real — nombres ficticios: Yrma, Cyndi, Kelly, Martha, Cindy

8. Mostrar flujo **brigada (permanente) vs jornada (evento) vs tarea (acción)** en al menos una pantalla de ayuda o tooltip

---

## 15. Pantallas adicionales (wireframe ASCII)

### Login moderadora
```
╔══════════════════════════════════╗
║  👩‍👧 Coordinación                  ║
║  Cuidadoras Caracas              ║
╠══════════════════════════════════╣
║  Correo                          ║
║  ┌────────────────────────────┐  ║
║  └────────────────────────────┘  ║
║  Contraseña                      ║
║  ┌────────────────────────────┐  ║
║  └────────────────────────────┘  ║
║  ┌────────────────────────────┐  ║
║  │         Entrar             │  ║
║  └────────────────────────────┘  ║
╚══════════════════════════════════╝
```

### Bottom nav moderadora (móvil)
```
┌────┬────┬────┬────┬────┐
│ 🏠 │ 👥 │ ➕ │ 📅 │ ⋯  │
│Inic│Vol.│    │Jorn│Más │
└────┴────┴────┴────┴────┘
```

---

## 16. Checklist de aceptación (QA)

- [ ] Landing muestra 3 caminos: registro, entrar voluntaria, coordinadora
- [ ] Voluntaria entra con usuario red social + 4 dígitos cédula (sin localStorage)
- [ ] Voluntaria puede ver y editar sus brigadas en Mi cuenta
- [ ] Moderadora puede editar cualquier campo de voluntaria y guardar
- [ ] Moderadora puede crear jornada con tareas y obtener link compartible
- [ ] Voluntaria confirma asistencia y se apunta a tareas ("Yo me encargo")
- [ ] Tareas sin dueño visibles en rojo/naranja; export WA funciona
- [ ] Tab transporte alerta cuando cupos < necesitados
- [ ] Cerrar jornada puede marcar sitio como ya ayudado (anti-duplicado)
- [ ] PII no visible sin login moderadora
- [ ] Funciona en iPhone Safari y Chrome Android
- [ ] Sin localStorage / sessionStorage
- [ ] No hay sugerencia automática de brigada por IA

---

*Documento v1.1 — 6 jul 2026 — ForVzla / Angélisa + Cris (revisión spec)*
