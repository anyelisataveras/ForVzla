# User Stories — Coordinación Cuidadoras Caracas

> **Complemento de:** `docs/spec-cuidadoras-coordinacion-ui.md` (v1.1)  
> **Handoff diseño:** `handoff/cuidadoras-design/handoff-cursor/` (Claude Design, 6 jul 2026)  
> **Uso:** priorizar backlog, diseño e implementación.  
> **Formato:** `CC-###` = ID · **P0–P3** = prioridad · criterios de aceptación verificables.

> **Versión backlog:** 1.1 — repriorización 6 jul 2026 (censo coordinadoras primero)

---

## Priorización actual (decisión de producto)

**Objetivo inmediato:** que Dari y las coordinadoras **entren al panel**, **busquen y editen** el censo de voluntarias, y que el **formulario público** siga activo desde la landing.

**Después:** jornadas, RSVP, transporte y tareas (Sprint 1).

| Sprint | Foco | Para quién |
|--------|------|------------|
| **0 — Censo** | Landing + formulario + panel coord + buscar/editar voluntarias | Dari, moderadoras |
| **1 — Jornadas** | Crear salidas, RSVP, transporte, tareas | Jeudy, Ren, Cindy, voluntarias |
| **2+** | Sitios, brigadas, export, inventario | Delegación y memoria |

---

## Leyenda de prioridad

| Nivel | Significado | Cuándo |
|-------|-------------|--------|
| **P0** | Bloqueante — censo y coordinadoras | Sprint 0 (ahora) |
| **P1** | Jornadas y participación voluntaria | Sprint 1 |
| **P2** | Importante — memoria institucional y delegación | Semana 2–4 |
| **P3** | Deseable / plataforma / otro grupo | Backlog |

**Roles:** `VOL` voluntaria · `MOD` moderadora · `COB` coordinadora de brigada · `TEC` equipo ForVzla

---

## Resumen para priorizar (vista rápida)

| P0 | P1 | P2 | P3 |
|----|----|----|-----|
| **7** stories | **19** stories | 11 stories | 6 stories |

**Orden Sprint 0:** CC-110 → CC-004 → CC-001 → CC-002 → CC-010 → CC-011

---

## Épica A — Acceso y landing

### CC-001 · Landing del grupo
**P0** · `VOL` · `MOD`

**Como** visitante del link de WhatsApp,  
**quiero** ver una página clara con tres opciones (registrarme, entrar como voluntaria, entrar como coordinadora),  
**para** saber por dónde empezar sin confundirme con el formulario largo.

**Criterios de aceptación**
- [ ] `/cuidadoras-caracas` muestra 3 CTAs y link «← Ayuda Venezuela»
- [ ] CTA registro → `/cuidadoras-caracas/registro`
- [ ] CTA voluntaria → `/cuidadoras-caracas/entrar`
- [ ] CTA coordinadora → `/cuidadoras-caracas/coord`
- [ ] Mobile-first, tokens de diseño del spec §4

**Spec:** §3 landing · §6.0  
**Depende de:** —

---

### CC-002 · Registro de voluntaria (formulario público)
**P0** · `VOL` · `MOD`

**Como** voluntaria nueva,  
**quiero** completar el registro en 3 pasos desde un link claro,  
**para** quedar en el censo y recibir mi número de voluntaria.

**Como** moderadora (Dari),  
**quiero** que el formulario siga activo y enlazado desde la landing,  
**para** mandar un solo link al grupo de WhatsApp mientras armamos el panel.

**Criterios de aceptación**
- [ ] Formulario funciona en `/cuidadoras-caracas/registro`
- [ ] Redirect desde landing; URL `/cuidadoras-caracas` antigua → landing (no form directo)
- [ ] Antiduplicado por cédula; mensaje claro si ya existe
- [ ] Muestra número de voluntaria al finalizar
- [ ] Panel coord: acción «Copiar link de registro» para compartir en WA
- [ ] Nuevos registros visibles en listado moderadora al recargar

**Spec:** §5.1 · `public/cuidadoras-caracas.html`  
**Depende de:** CC-001  
**Nota:** brigadas en registro = P2 (CC-090). Edición post-registro = moderadora (CC-011).

---

### CC-003 · Login voluntaria
**P1** · `VOL`

**Como** voluntaria registrada,  
**quiero** entrar con mi usuario de red social y los últimos 4 dígitos de mi cédula,  
**para** ver jornadas y confirmar sin depender del chat.

**Criterios de aceptación**
- [ ] Pantalla `/entrar`: plataforma (IG/X/Gmail) + usuario + 4 dígitos cédula
- [ ] Match contra `red_social_*` + `id_dni` en `voluntarios`
- [ ] Sesión solo en memoria (sin localStorage)
- [ ] Error claro si falla + link a registro
- [ ] Tras login desde link de jornada → vuelve a esa jornada

**Spec:** §2 auth voluntaria · §6.0  
**Depende de:** CC-002

---

### CC-004 · Login moderadora
**P0** · `MOD`

**Como** moderadora (Dari, Ren, Cindy…),  
**quiero** entrar al panel de coordinación con correo y contraseña,  
**para** gestionar el grupo sin acceder al admin global de ForVzla.

**Criterios de aceptación**
- [ ] `/cuidadoras-caracas/coord` con login Supabase Auth
- [ ] Solo usuarios con rol moderador del grupo `cuidadoras_caracas`
- [ ] Mensaje si no tiene permiso
- [ ] Botón cerrar sesión

**Spec:** §7.0 · §2 auth moderadoras  
**Depende de:** —

---

## Épica B — Censo de voluntarias (moderadora)

### CC-010 · Listar y buscar voluntarias del grupo
**P0** · `MOD`

**Como** moderadora,  
**quiero** ver el listado completo de voluntarias y **buscarlas** por nombre, cédula o teléfono,  
**para** sustituir el Excel y la lista copiada en WhatsApp (caso Dari: chicas «en rojo»).

**Criterios de aceptación**
- [ ] Tab Voluntarias: nombre, #, cédula, teléfono, zona, transporte, brigadas
- [ ] Búsqueda por nombre, cédula, teléfono
- [ ] Filtros: con vehículo, sin registro completo, por zona
- [ ] Indicador visual «en rojo» si faltan datos críticos (teléfono, etc.)
- [ ] Contador total

**Spec:** §7.3  
**Depende de:** CC-004

---

### CC-011 · Editar voluntaria
**P0** · `MOD`

**Como** moderadora,  
**quiero** editar todos los datos de una voluntaria,  
**para** completar fichas incompletas (caso Dari: chicas «en rojo»).

**Criterios de aceptación**
- [ ] Modal/pantalla edición con todos los campos del registro + brigadas + notas internas
- [ ] Validación cédula única por grupo
- [ ] Guardar y reflejar en listado al instante
- [ ] Toggle activa/inactiva (baja lógica)

**Spec:** §7.4  
**Depende de:** CC-010

---

### CC-012 · Agregar voluntaria manualmente
**P1** · `MOD`

**Como** moderadora,  
**quiero** crear una ficha de voluntaria sin que pase por el formulario público,  
**para** cargar datos que ya tengo en Excel o por teléfono.

**Criterios de aceptación**
- [ ] Mismo formulario que edición, campos vacíos
- [ ] Asigna `numero_voluntaria` automático
- [ ] No exige declaración jurada en UI (implícita al crear por moderadora)

**Spec:** §7.5  
**Depende de:** CC-011

---

### CC-013 · Eliminar voluntaria
**P2** · `MOD`

**Como** moderadora,  
**quiero** eliminar un registro erróneo con confirmación,  
**para** mantener el censo limpio.

**Criterios de aceptación**
- [ ] Confirmación doble
- [ ] No borra historial de inscripciones pasadas (soft delete preferible)

**Spec:** §7.3  
**Depende de:** CC-010

---

## Épica C — Jornadas (moderadora)

### CC-020 · Crear jornada
**P1** · `MOD`

**Como** moderadora,  
**quiero** publicar una jornada con fecha, lugar, horarios y misión,  
**para** reemplazar el mensaje largo de Jeudy en WhatsApp.

**Criterios de aceptación**
- [ ] Formulario: título, fecha, horas, punto encuentro, descripción, vestimenta, llevar
- [ ] Seleccionar sitio existente o nombre rápido inline
- [ ] Multi-select brigadas involucradas
- [ ] Estados: borrador / abierta
- [ ] Metas opcionales (voluntarias, vehículos)

**Spec:** §7.8 · §5.4  
**Depende de:** CC-004

---

### CC-021 · Listar y editar jornadas
**P1** · `MOD`

**Como** moderadora,  
**quiero** ver jornadas próximas, pasadas y borradores,  
**para** corregir datos o cancelar una salida.

**Criterios de aceptación**
- [ ] Pestañas Próximas / Pasadas / Borradores
- [ ] Editar todos los campos de CC-020
- [ ] Cambiar estado (abierta, llena, cancelada, realizada)

**Spec:** §7.7  
**Depende de:** CC-020

---

### CC-022 · Compartir link de jornada
**P1** · `MOD`

**Como** moderadora,  
**quiero** copiar un texto listo para WhatsApp con el link de la jornada,  
**para** que las chicas confirmen en un solo toque.

**Criterios de aceptación**
- [ ] Botón «Guardar y copiar link WhatsApp»
- [ ] Texto en español con fecha, lugar, hora y URL `/jornada/{id}`
- [ ] Copia al portapapeles + toast de confirmación

**Spec:** §7.8  
**Depende de:** CC-020

---

### CC-023 · Dashboard próxima jornada
**P1** · `MOD`

**Como** moderadora,  
**quiero** ver en el inicio un resumen de la próxima jornada,  
**para** saber de un vistazo cuántas van y si falta transporte.

**Criterios de aceptación**
- [ ] Bloque con confirmadas, sin ride, cupos, alerta si falta ride
- [ ] Accesos: ver detalle, copiar para WA

**Spec:** §7.2  
**Depende de:** CC-020, CC-041

---

### CC-024 · Cerrar jornada y registrar asistencia
**P2** · `MOD`

**Como** moderadora,  
**quiero** marcar una jornada como realizada y quién asistió,  
**para** tener historial y actualizar el sitio.

**Criterios de aceptación**
- [ ] Modal cierre: realizada + checklist asistencia
- [ ] Opción actualizar cobertura del sitio vinculado
- [ ] Opción «sitio ya tenía ayuda suficiente»

**Spec:** §7.9 cierre · §8.6  
**Depende de:** CC-021, CC-050

---

## Épica D — Participación voluntaria

### CC-030 · Elegir mis brigadas (Mi cuenta)
**P1** · `VOL`

**Como** voluntaria,  
**quiero** ver y cambiar las brigadas a las que pertenezco,  
**para** recibir actividades acordes a cómo quiero ayudar.

**Criterios de aceptación**
- [ ] `/mi-cuenta` muestra brigadas actuales como chips seleccionables
- [ ] Al tocar ℹ️: requisitos **informativos** (no bloquean)
- [ ] Puedo apuntarme a varias brigadas
- [ ] Muestra número de carnet y nombre

**Spec:** §6.1 · §2 brigadas  
**Depende de:** CC-003

---

### CC-031 · Ver listado de jornadas
**P1** · `VOL`

**Como** voluntaria,  
**quiero** ver las próximas jornadas del grupo,  
**para** saber cuándo y dónde hay salidas.

**Criterios de aceptación**
- [ ] Lista ordenada por fecha; cards con fecha, lugar, brigadas, estado
- [ ] Solo jornadas no-borrador
- [ ] Empty state si no hay jornadas
- [ ] Acceso desde mi cuenta o `/jornadas` (logueada)

**Spec:** §6.2  
**Depende de:** CC-003, CC-020

---

### CC-032 · Confirmar asistencia a jornada (RSVP)
**P1** · `VOL`

**Como** voluntaria,  
**quiero** decir si voy o no puedo, e indicar transporte,  
**para** que Cindy arme los rides sin preguntar una por una.

**Criterios de aceptación**
- [ ] Detalle jornada: Voy / No puedo
- [ ] Checkbox necesito transporte
- [ ] Checkbox ofrezco transporte + cupos (0–N)
- [ ] Notas opcionales
- [ ] Guardar y toast de éxito; puedo cambiar respuesta hasta X h antes (config)

**Spec:** §6.3  
**Depende de:** CC-003, CC-031

---

### CC-033 · Apuntarme a tareas de la jornada
**P1** · `VOL`

**Como** voluntaria,  
**quiero** decir «yo me encargo» de una tarea concreta (preparar comida, llevar kits…),  
**para** que no quede nada sin dueño.

**Criterios de aceptación**
- [ ] Lista de tareas en detalle jornada
- [ ] Botón «Yo me encargo» si cupo disponible
- [ ] Tareas cubiertas readonly; sin dueño destacadas
- [ ] Puedo apuntarme a tarea de brigada que no es la mía

**Spec:** §6.3 tareas · §5.5  
**Depende de:** CC-032, CC-040

---

### CC-034 · Entrar a jornada desde link de WhatsApp
**P1** · `VOL`

**Como** voluntaria que recibe el link en el grupo,  
**quiero** abrir la jornada, identificarme si hace falta, y confirmar,  
**para** no buscar en menús.

**Criterios de aceptación**
- [ ] `/jornada/{id}` funciona como deep link
- [ ] Si no hay sesión → login → redirect de vuelta
- [ ] Funciona en móvil 3G

**Spec:** §3 URLs · §8.2  
**Depende de:** CC-003, CC-032

---

## Épica E — Tareas y coordinadoras de brigada

### CC-040 · Crear tareas en una jornada
**P1** · `MOD` · `COB`

**Como** moderadora o coordinadora de brigada,  
**quiero** agregar tareas concretas a una jornada (título, brigada, cupos),  
**para** que las voluntarias se repartan el trabajo.

**Criterios de aceptación**
- [ ] En crear/editar jornada: + Agregar tarea
- [ ] Campos: título, brigada, cupos (default 1)
- [ ] Estado inicial `sin_dueno`

**Spec:** §7.8 tareas · §5.5  
**Depende de:** CC-020

---

### CC-041 · Ver tareas sin dueño (moderadora)
**P1** · `MOD` · `COB`

**Como** moderadora,  
**quiero** ver qué tareas nadie ha tomado,  
**para** insistir en WhatsApp antes de la salida.

**Criterios de aceptación**
- [ ] Tab Tareas en detalle jornada
- [ ] Tareas `sin_dueno` en naranja/rojo
- [ ] Contador en dashboard si hay sin dueño

**Spec:** §7.9 tab Tareas  
**Depende de:** CC-040

---

### CC-042 · Copiar aviso de tarea sin dueño
**P1** · `MOD`

**Como** moderadora,  
**quiero** copiar un mensaje corto para WA pidiendo quién toma una tarea,  
**para** resolver el «queda sin dueño» sin reescribir.

**Criterios de aceptación**
- [ ] Botón por tarea sin dueño y en tab Exportar
- [ ] Texto: qué falta + link jornada

**Spec:** §7.9 · §7.12  
**Depende de:** CC-041

---

### CC-043 · Asignar coordinadora de brigada
**P2** · `MOD`

**Como** moderadora,  
**quiero** designar una voluntaria como coordinadora de cada brigada,  
**para** delegar la planificación de tareas.

**Criterios de aceptación**
- [ ] Tab Brigadas: lista 7 brigadas con coordinadora opcional
- [ ] Select entre voluntarias activas
- [ ] Coordinadora puede crear tareas solo de su brigada (permiso reducido — opcional v1: mismo panel MOD)

**Spec:** §7.6 · §5.2  
**Depende de:** CC-010

---

## Épica F — Transporte

### CC-050 · Vista transporte de jornada
**P1** · `MOD`

**Como** coordinadora de logística (Cindy),  
**quiero** ver quién necesita ride y quién ofrece cupos,  
**para** armar los carros sin leer 50 mensajes.

**Criterios de aceptación**
- [ ] Tab Transporte: lista sin transporte + lista con vehículo y cupos
- [ ] Resumen: necesitan N, cupos M, alerta si M < N
- [ ] Link teléfono / WhatsApp por persona

**Spec:** §7.9 tab Transporte  
**Depende de:** CC-032

---

### CC-051 · Copiar lista transporte para WhatsApp
**P1** · `MOD`

**Como** moderadora,  
**quiero** exportar la lista de transporte en texto,  
**para** pegarla en el grupo y coordinar rides.

**Criterios de aceptación**
- [ ] Opción en tab Exportar y tab Transporte
- [ ] Incluye nombres, teléfonos, quién necesita / quién lleva

**Spec:** §7.12  
**Depende de:** CC-050

---

## Épica G — Sitios y cobertura

### CC-060 · Registrar sitio a atender
**P1** · `MOD`

**Como** moderadora,  
**quiero** guardar refugios/campamentos con dirección y cantidad de afectados,  
**para** no repetir visitas inútiles (pedido Dari/Rem).

**Criterios de aceptación**
- [ ] CRUD sitio: nombre, alias, zona, dirección, personas, niños (agregado)
- [ ] Contacto solo visible para moderadoras
- [ ] Permiso verificado (checkbox)

**Spec:** §7.10–7.11 · §5.3  
**Depende de:** CC-004

---

### CC-061 · Marcar cobertura por sitio
**P1** · `MOD`

**Como** moderadora,  
**quiero** indicar si en un sitio ya hay comida, medicinas, cotillón y recreación cubiertos,  
**para** decidir si vale la pena ir.

**Criterios de aceptación**
- [ ] 4 enums: ninguna / baja / ok / sobra
- [ ] Visible en card de sitio
- [ ] Última visita auto-actualizada al cerrar jornada

**Spec:** §7.10 · §5.3  
**Depende de:** CC-060

---

### CC-062 · Marcar sitio con ayuda duplicada
**P2** · `MOD` · `VOL`

**Como** moderadora o voluntaria al cerrar visita,  
**quiero** indicar que otro equipo ya cubrió la ayuda,  
**para** evitar viajes perdidos (caso Ren).

**Criterios de aceptación**
- [ ] Flag `ayuda_duplicada` en sitio
- [ ] Checkbox al cerrar jornada
- [ ] Indicador visual en listado sitios

**Spec:** §5.3 · §7.9 cierre  
**Depende de:** CC-061, CC-024

---

### CC-063 · Crear jornada desde sitio
**P2** · `MOD`

**Como** moderadora,  
**quiero** lanzar una nueva jornada pre-llenada con el sitio,  
**para** planificar más rápido.

**Criterios de aceptación**
- [ ] Botón «Nueva jornada aquí» en card sitio
- [ ] Formulario jornada con `sitio_id` preseleccionado

**Spec:** §7.10  
**Depende de:** CC-020, CC-060

---

## Épica H — Materiales e inventario

### CC-070 · Checklist de materiales por jornada
**P2** · `MOD`

**Como** moderadora,  
**quiero** listar qué materiales necesitamos (kits, juguetes, pintura…),  
**para** saber qué falta comprar o pedir (miércoles La California).

**Criterios de aceptación**
- [ ] Ítems con cantidad necesaria / conseguida
- [ ] Estados pendiente / parcial / cubierta
- [ ] Notas de donante opcional

**Spec:** §5.6 · §7.8 materiales  
**Depende de:** CC-020

---

### CC-071 · Catálogo de ítems con autocompletado
**P3** · `MOD`

**Como** moderadora,  
**quiero** que al escribir un material me sugiera ítems ya usados,  
**para** no duplicar nombres (cotillones vs cotillón).

**Criterios de aceptación**
- [ ] Tabla `items_inventario` por grupo
- [ ] Autocompletado al agregar ítem en jornada

**Spec:** §5.6 catálogo  
**Depende de:** CC-070

---

## Épica I — Exportación

### CC-080 · Exportar resumen jornada para WhatsApp
**P1** · `MOD`

**Como** moderadora,  
**quiero** generar texto con confirmadas, transporte y tareas pendientes,  
**para** un solo mensaje de coordinación en el grupo.

**Criterios de aceptación**
- [ ] Tab Exportar con plantillas seleccionables
- [ ] Preview antes de copiar
- [ ] Plantillas: resumen jornada, confirmadas, transporte, sin dueño

**Spec:** §7.12  
**Depende de:** CC-032, CC-050, CC-041

---

### CC-081 · Exportar censo CSV
**P2** · `MOD`

**Como** moderadora (Dari),  
**quiero** descargar el censo en CSV,  
**para** respaldo y cruces con Excel.

**Criterios de aceptación**
- [ ] Solo moderadoras logueadas
- [ ] Respeta filtros activos del listado

**Spec:** §7.12  
**Depende de:** CC-010

---

## Épica J — Registro y formulario público

### CC-090 · Brigadas en formulario de registro
**P0** · `VOL` · *(parcial — con migración brigadas)*

**Como** voluntaria nueva,  
**quiero** elegir mis brigadas al registrarme,  
**para** no tener que entrar después a Mi cuenta.

**Criterios de aceptación**
- [ ] Paso 3 del registro: multi-select brigadas con requisitos informativos
- [ ] Guarda en `voluntarios.brigadas`

**Spec:** §5.1 · CC-030  
**Depende de:** CC-002

---

### CC-091 · Simplificar campos del registro
**P2** · `VOL` · `MOD`

**Como** producto,  
**queremos** revisar campos opcionales (ej. estado civil),  
**para** pedir la mínima información útil.

**Criterios de aceptación**
- [ ] `estado_civil` opcional o eliminado
- [ ] Validar con Dari qué campos son obligatorios para permisos (Yeudi: cédula, nombre)

**Spec:** §5.1 · reunión 6 jul  
**Depende de:** CC-002

---

## Épica K — Plataforma y futuro

### CC-100 · Carnet digital
**P3** · `VOL`

**Como** voluntaria,  
**quiero** ver mi carnet con foto y número en la app,  
**para** identificarme en campo (hoy lo manda Ren por WA).

**Criterios de aceptación**
- [ ] Pantalla carnet en Mi cuenta
- [ ] Moderadora puede subir `foto_url`

**Spec:** §5.1 fase 2  
**Depende de:** CC-030

---

### CC-101 · Link personal pre-autenticado
**P3** · `VOL`

**Como** moderadora,  
**quiero** enviar a una voluntaria un link que ya la identifica,  
**para** reducir fricción de login.

**Criterios de aceptación**
- [ ] Token único por voluntaria, expira
- [ ] `/jornada/{id}?v={token}` sin pedir cédula

**Spec:** §2 auth · fase 3  
**Depende de:** CC-034

---

### CC-102 · Segundo grupo de voluntarios (plantilla)
**P3** · `TEC`

**Como** equipo ForVzla,  
**queremos** reutilizar el módulo para otro grupo (bomberos USB, profesionales),  
**para** escalar sin reescribir.

**Criterios de aceptación**
- [ ] `grupo` parametrizado en URLs o subruta
- [ ] RLS por grupo
- [ ] Branding configurable por grupo

**Spec:** §12 otros grupos  
**Depende de:** MVP completo cuidadoras

---

### CC-103 · Puente sitio → mapa SOS
**P3** · `MOD`

**Como** moderadora,  
**quiero** reportar una necesidad pública al mapa desde un sitio visitado,  
**para** conectar coordinación privada con el SOS.

**Criterios de aceptación**
- [ ] Botón en sitio; moderadora valida antes de publicar
- [ ] No mezcla tablas PII

**Spec:** §12 fase 3  
**Depende de:** CC-060

---

## Épica L — Técnico / calidad (transversal)

### CC-110 · RLS y privacidad PII
**P0** · `TEC`

**Como** sistema,  
**debe** exponer datos de voluntarias solo a moderadoras autenticadas,  
**para** cumplir acuerdo de reunión (PII no público).

**Criterios de aceptación**
- [ ] `voluntarios` select solo `is_moderador_grupo`
- [ ] Inscripciones: voluntaria ve solo la suya; moderadora ve todas del grupo
- [ ] Sin PII en URLs ni logs cliente

**Spec:** §2 · §11  
**Depende de:** CC-004

---

### CC-111 · Mobile y accesibilidad base
**P1** · `TEC`

**Como** voluntaria en Caracas con teléfono básico,  
**quiero** que la app funcione en Safari/Android y con mala señal,  
**para** poder confirmar desde el bus.

**Criterios de aceptación**
- [ ] Tap targets ≥ 44px; inputs 16px
- [ ] Sin localStorage
- [ ] Skeleton / feedback en guardado
- [ ] `prefers-reduced-motion` respetado

**Spec:** §11  
**Depende de:** —

---

## Matriz de priorización

### Sprint 0 — «Censo coordinadoras» (P0) ← **AHORA**

Entregable para Dari: *entrar → buscar → editar → compartir link de registro*.

| Orden | ID | Story | Esfuerzo |
|-------|-----|-------|----------|
| 1 | CC-110 | RLS y privacidad PII | M |
| 2 | CC-004 | Login moderadora | S |
| 3 | CC-001 | Landing (3 caminos) | S |
| 4 | CC-002 | Formulario público + link desde panel | S |
| 5 | CC-010 | Listar y **buscar** voluntarias | M |
| 6 | CC-011 | **Editar** voluntaria (todos los campos) | M |

**Fuera de Sprint 0 (pero diseño ya listo en handoff):** login voluntaria, jornadas, RSVP, transporte, tareas.

**Criterio de done Sprint 0:** Dari puede completar fichas incompletas, encontrar a Yrma por nombre/cédula, y pasar el link de registro a las que faltan.

---

### Sprint 1 — «Jornadas y salidas» (P1)

| Bloque | Stories |
|--------|---------|
| Voluntaria entra y confirma | CC-003, CC-031, CC-032, CC-034, CC-030 |
| Moderadora publica salida | CC-020, CC-021, CC-022, CC-023 |
| Tareas y transporte | CC-040, CC-041, CC-042, CC-050, CC-051 |
| Censo extra | CC-012 (crear manual) |
| Calidad | CC-111 |

---

### Sprint 2 — Delegación y memoria (P2)
CC-013, CC-024, CC-043, CC-060, CC-061, CC-062, CC-063, CC-070, CC-081, CC-090, CC-091

---

### Backlog (P3)
CC-071, CC-100, CC-101, CC-102, CC-103

---

## Fuera de scope (no crear story)

| Tema | Motivo |
|------|--------|
| IA sugiere brigada | Rechazado reunión 6 jul |
| API WhatsApp | Costo; copiar texto basta |
| Inventario medicamentos estructurado | Complejidad; texto libre |
| Expedientes legales / menores | Requiere marco Yeudi |
| Integración Firestore legacy | Reemplazado por Supabase |

---

## Cómo usar este documento

1. **Priorizar:** revisar Sprint 0 con Dari — ¿falta algo para la próxima salida real?
2. **Diseño:** cada P0 debe tener pantalla en Claude Design (ver spec §14).
3. **Implementar:** una story = un PR pequeño cuando sea posible.
4. **Cerrar:** marcar criterios de aceptación; actualizar estado en esta tabla o en Linear.

**Próximo paso:** implementar Sprint 0 (6 stories). Validar con Dari que buscar + editar cubre el Excel «en rojo».

---

## Mapa handoff Claude Design → User stories

**Sprint 0 usa:** `landing`, `m-login`, `m-panel` (tab voluntarias + overlay editar), `registro` → producción.

Prototipo: `handoff/cuidadoras-design/handoff-cursor/Coordinacion Cuidadoras.dc.html`

| Pantalla (menú ☰) | Ruta prototipo | Sprint | Stories |
|-------------------|----------------|--------|---------|
| Landing (3 caminos) | `landing` | 0 | CC-001 |
| Registro → prod | `registro` | 0 | CC-002 |
| Login moderadora | `m-login` | 0 | CC-004 |
| Voluntarias + editar | `m-panel` + overlay | 0 | CC-010, CC-011 |
| Agregar voluntaria | overlay | 1 | CC-012 |
| Login voluntaria | `v-login` | 1 | CC-003 |
| Mi cuenta + brigadas | `v-cuenta` | 1 | CC-030 |
| Lista jornadas | `v-jornadas` | 1 | CC-031 |
| Detalle jornada + RSVP | `v-jornada` | 1 | CC-032, CC-033, CC-034 |
| Panel Inicio | `m-panel` tab inicio | 1 | CC-023 |
| Jornadas + crear | `m-panel` tab jornadas | 1 | CC-020–022, CC-040 |
| Detalle jornada mod | overlay tabs | 1 | CC-041, CC-042, CC-050, CC-051 |
| Brigadas | `m-panel` tab brigadas | 2 | CC-043 |
| Sitios | `m-panel` tab sitios | 2 | CC-060–063 |
| Exportar | `m-panel` tab exportar | 1–2 | CC-080, CC-081 |
| Design system | `ds` | — | CC-111 |

---

*User stories v1.1 — 6 jul 2026 — repriorización censo primero*
