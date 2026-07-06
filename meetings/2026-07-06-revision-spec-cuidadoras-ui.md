# Reunión: revisión spec UI — Coordinación Cuidadoras Caracas

> **Fecha:** 6 jul 2026, 13:20 (hora local España)  
> **Duración:** ~29 min  
> **Transcripción:** `Meeting Transcription (8).txt` (Tactiq)  
> **Documento revisado:** `docs/spec-cuidadoras-coordinacion-ui.md`  
> **Estado:** decisiones de producto antes de diseño en Claude Design

---

## Participantes

| Persona | Equipo | Rol |
|---------|--------|-----|
| **Angélisa** (Anyelisa Taveras) | ForVzla | Desarrollo / producto |
| **María Cristina** (Cris) | ForVzla | Líder del proyecto |

---

## Objetivo de la reunión

Revisar el brainstorming y el spec UI del módulo de coordinación para **Cuidadoras Caracas** antes de pasarlo a Claude Design. Alinear conceptos (brigadas vs jornadas vs tareas), autenticación, alcance y prioridades de plataforma.

---

## Resumen ejecutivo

Se validó la dirección general del spec: espacio privado por grupo, moderadoras que mantienen censo y jornadas, voluntarias que confirman asistencia. Se **aclaró y amplió** el modelo de brigadas (no solo etiquetas — coordinadores por brigada y tareas dentro de la actividad). Se **rechazó** la sugerencia automática de brigada con IA. `/cuidadoras-caracas` pasa a ser **landing** del grupo con tres caminos (registro, coordinadora, voluntaria). WhatsApp queda como canal de comunicación, no como sistema a reemplazar ni integrar en v1. Se acordó **pausar el foco en rescates/scraper** y priorizar este módulo. Próximo paso: diseño en Claude Design → segunda revisión Angélisa + Cris → implementación → demo a **Dari** como stakeholder principal.

---

## Decisiones

| # | Decisión |
|---|----------|
| 1 | **Brigada ≠ jornada.** La jornada es la salida/actividad con fecha y lugar. La brigada es un grupo de interés permanente (logística alimentos, recreación, etc.); la voluntaria elige a cuál pertenece. |
| 2 | **Cada brigada puede tener coordinador(a)** que publique planificación y tareas concretas (“preparo comida”, “llevo donación”, “acompaño emocionalmente”). Las voluntarias de esa brigada se apuntan voluntariamente a cada tarea. |
| 3 | **Tareas sin dueño:** si una tarea de jornada no se llena, el coordinador insiste (hoy por WA; en UI debe verse claro qué queda pendiente / “sin dueño”). |
| 4 | **No usar IA** para asignar brigadas. Mostrar requisitos o características de la brigada; la persona **se apunta sola**. No encasillar: alguien de una brigada puede ayudar en otra si hace falta. |
| 5 | **`/cuidadoras-caracas` = landing del grupo:** (a) registrarse como voluntaria, (b) entrar como coordinadora, (c) entrar como voluntaria (ver brigada, actividades, confirmar). El formulario de registro pasa a segundo plano. |
| 6 | **Login voluntaria v1:** red social / correo que ya dieron en el registro (Instagram, X o Gmail + usuario) + **últimos dígitos de cédula** como clave. Más difícil de adivinar que solo número de carnet. |
| 7 | **Revisar campos del formulario:** minimizar PII innecesaria (ej. estado civil cuestionado). Mantener red social + usuario como identificador de acceso. |
| 8 | **WhatsApp:** no integrar en v1. Ellas administran y deciden en ForVzla; comunican por WA. Integraciones WA tienen costo. |
| 9 | **Scraper / Apify / rescates:** pausar como foco principal; mantener vivo por si hay urgencia. Prioridad = módulo cuidadoras. |
| 10 | **Sitios + logística (pedido de Dari):** al crear sitio — nombre, dirección, cantidad afectados/niños; cobertura cotillones, comida, medicinas; conteo de voluntarios, vehículos, motos. Evitar duplicar ayuda de otros equipos. |
| 11 | **Inventario:** no MVP, pero diseñar pensando en lista reutilizable de ítems (cotillones, etc.) con autocompletado para no duplicar nombres. Medicamentos: texto libre (demasiado complejo para inventario estructurado v1). |
| 12 | **Retroalimentación de campo:** las voluntarias en Caracas deben reportar qué centros ya fueron ayudados para no repetir viajes inútiles. |
| 13 | **Proceso de entrega:** Claude Design → revisión Angélisa + Cris → implementar → mostrar a **Dari** (stakeholder y criterio técnico del grupo). Yeudi no es revisora principal de UI en esta fase. |
| 14 | **Visión plataforma:** construir para cuidadoras pero **reutilizable** para otros grupos de voluntarios (ej. red de profesionales / bomberos USB). |
| 15 | **Casos legales / menores / gobierno (Yeudi, abogados):** fuera de alcance tecnológico inmediato; hablar con Yeudi solo si hay confianza y esquema de seguridad claro. No meter expedientes de niños sin marco definido. |

---

## Temas discutidos en detalle

### Brigadas y tareas dentro de jornadas

Angélisa explicó el spec: moderadoras mantienen censo, crean jornadas, gestionan sitios y transporte; voluntarias confirman en pocos toques.

Cris propuso que el flujo sea como un **post de actividad**: la coordinadora anuncia fecha y necesidades; la gente se va apuntando.

Angélisa distinguió:

- **Jornada** = actividad concreta (ej. martes 9 AM La Guaira).
- **Brigada** = afiliación de largo plazo según talento/interés (logística alimentos, salud, recreación…).
- Quien se apunta a una brigada recibe información relevante de esas actividades.
- Cada brigada puede tener coordinador que desglosa: *“para mañana necesitamos X; yo me encargo de preparar; yo de llevar”*.

Cris reforzó el caso **“sin dueño”**: si nadie se apunta, debe quedar visible y re-lanzarse (como hoy en el grupo de WA).

### IA para sugerir brigada — descartada

Dari había sugerido que el sistema (o IA) sugiera brigada según perfil. Acuerdo:

- La persona **elige** brigada(s).
- Se muestran características/requisitos de cada brigada en el formulario o al apuntarse.
- No restringir en exceso: muchas brigadas son abiertas (donaciones, recreación, compañía emocional).
- *“La inteligencia artificial no lee la mente”* — Cris.

### Landing y navegación

Hoy solo existe el formulario de registro. Evolución acordada:

```
/cuidadoras-caracas
├── Registrarme (voluntaria nueva)
├── Soy coordinadora → panel moderación
└── Ya soy voluntaria → login → mis brigadas + jornadas + confirmar
```

Links directos a jornada (`/jornada/{id}`) para compartir en WhatsApp; la voluntaria puede inscribirse desde ahí.

### Autenticación

- **Coordinadoras:** panel dedicado (como admin del grupo), no el admin global de ForVzla.
- **Voluntarias:** correo/usuario de red social del registro + últimos dígitos de cédula.
- Pendiente confirmar en data migrada cuántas tienen Gmail vs solo Instagram.

### Sitios, inventario y no duplicar ayuda

Retomado el pedido de Dari a Rem/Jeudy:

- Esquema de logística: qué tenemos (voluntarias, vehículos, motos) y **dónde** vamos.
- Por sitio: afectados, calidad/cantidad de cotillones, comida, medicinas.
- Cris: a futuro **inventario** por brigada (quién cuenta y carga datos; hay que confiar en esa data).
- Problema real: llegar a un centro que **ya fue ayudado** = viaje perdido → marcar centros atendidos y pedir retroalimentación a quienes están en Caracas.
- Información de centros con niños puede ser **confidencial** — definir cómo se maneja en UI (solo moderadoras).

Angélisa: lista de ítems con autocompletado al escribir inventario; medicamentos en texto libre por complejidad (dosis, tipo).

### WhatsApp y scraper

- WA sigue siendo herramienta útil para el grupo; ForVzla es donde **queda escrito** lo organizado.
- Apify ya gastado; no priorizar lectura automática de rescates si nadie en Venezuela está usando ese flujo.
- Mapa/rescates se deja vivo; foco de desarrollo = cuidadoras.

### Stakeholders y siguientes revisiones

- **Dari** = principal para probar y validar (está en la administración del grupo, perfil tecnología).
- Ren delega; Yeudi más en permisos y casos legales.
- Después del diseño: reunión corta Angélisa + Cris antes de codear; luego demo a Dari (no necesariamente pasar diseño a Yeudi antes).

### Visión más amplia (no scope inmediato)

- Otros grupos de voluntarios (contacto de Cris con bomberos USB, hidrataciones, lámparas).
- Red de profesionales (Leslie / abogados) — canal aparte; hablar con Yeudi.
- Casos judiciales, hogares de acogida, expedientes de menores: problema institucional; ForVzla solo ayudaría si Yeudi define confianza y seguridad.

Cris: sin **data unificada de campo**, ninguna plataforma resuelve el problema raíz; al menos este grupo es un piloto concreto con Dari responsable.

---

## Cambios pendientes al spec UI

Actualizar `docs/spec-cuidadoras-coordinacion-ui.md` con:

| Tema | Cambio en spec |
|------|----------------|
| Landing | Sección nueva: home `/cuidadoras-caracas` con 3 entradas |
| Auth voluntaria | Reemplazar “# voluntaria + 4 dígitos cédula” por **usuario red social/correo + 4 dígitos cédula** |
| Brigadas | Modelo: coordinador por brigada + **tareas** dentro de jornada con estado “sin dueño” |
| IA | Eliminar o marcar explícitamente “fuera de scope” la sugerencia de brigada por IA |
| Tareas jornada | UI para apuntarse a tareas concretas (“preparo comida”, “llevo”, etc.) además del RSVP general |
| Formulario | Revisar obligatoriedad de estado civil y otros campos |
| Inventario | Nota de diseño futuro: catálogo de ítems + autocompletado |
| WhatsApp | Aclarar: exportar/copiar sí; integración API no en v1 |

---

## Acciones y responsables

| Acción | Quién | Estado |
|--------|-------|--------|
| Generar UI en Claude Design según spec + decisiones de hoy | Angélisa | ✅ Handoff en `handoff/cuidadoras-design/` |
| Actualizar spec con cambios de la tabla anterior | Angélisa | ✅ v1.1 spec |
| Segunda revisión de diseño antes de implementar | Angélisa + Cris | Pendiente |
| Demo / validación con Dari post-implementación | Angélisa → Dari | Pendiente |
| Confirmar en data si correo/Gmail está disponible para login | Angélisa | Pendiente |
| Hablar con Yeudi solo si hay propuesta concreta legal (fuera UI cuidadoras) | Cris | Pendiente |
| Contacto Leslie / red profesionales (bomberos USB, etc.) | Cris | Pendiente |

---

## Citas relevantes

> *“Si cada brigada tiene un coordinador que pueda decir: esta es la planificación para mañana… y la gente de esa brigada se apunte: yo me encargo de preparar la comida, yo de llevarla.”* — Cris

> *“Mira, esto queda sin dueño — alguien que se pueda apuntar.”* — Cris

> *“La inteligencia artificial no lee la mente… tú anuncias las características de la brigada y esa persona se tiene que apuntar.”* — Angélisa / Cris

> *“Cuidadoras Caracas va a ser el landing… entrar como coordinadora, como voluntaria, o registrarse.”* — Angélisa

> *“Ellas se administran acá y toman las decisiones; las comunican por WhatsApp.”* — Cris

> *“Si llegan a un centro que ya tiene ayuda, ese viaje es perdido… hay que marcar como ayudado.”* — Cris

> *“Dari va a ser la stakeholder de la solicitud — quien más criterio va a tener para probar.”* — Cris

---

## Referencias

- Spec UI: `docs/spec-cuidadoras-coordinacion-ui.md`
- Reunión previa con grupo: `meetings/2026-07-05-voluntarias-cuidadoras-caracas.md`
- Formulario actual: `public/cuidadoras-caracas.html`
- Transcripción original: `/Users/a/Downloads/Meeting Transcription (8).txt`
