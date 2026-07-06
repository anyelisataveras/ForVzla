# Reunión: voluntarias y cuidado de niños — Caracas

> **Fecha:** 5 jul 2026, 22:46 (hora local del participante en España)  
> **Duración:** ~36 min  
> **Transcripción:** `Reunion Voluntarias Venezuela.txt` (Tactiq)  
> **Estado del producto:** formulario desplegado en ForVzla el 5–6 jul 2026

---

## Participantes

| Persona | Equipo | Rol | Ubicación |
|---------|--------|-----|-----------|
| **Ren** (Renata Zavala) | Madres voluntarias | Coordinadora general del grupo | México |
| **Dari** | Madres voluntarias | Sistemas / registro de voluntarias | Venezuela (Falcón) |
| **Yeudi** | Madres voluntarias | Abogada líder; permisos y refugios | — *(salió temprano)* |
| **María Cristina** | ForVzla | Líder del proyecto | España |
| **Angélisa** | ForVzla | Desarrollo / producto | España |

---

## Contexto operativo (al inicio de la llamada)

Ren describe la situación en campo tras el terremoto:

- Dificultad para entrar a **La Guaira** (saqueos, gente que pide donaciones sin repartir).
- Campamentos que parecen refugios pero no lo son; familias con casa que duermen afuera por miedo a réplicas.
- Alta carga de mensajes: mucha gente quiere ayudar pero la coordinación se atasca.
- Ejemplo del día: 75 kits para ~160 personas; al llegar, los niños no estaban en el campamento (se estaban bañando en sus casas).

ForVzla ya tiene la página del mapa SOS; Ren no quiere pedir a las voluntarias que **vuelvan a llenar formularios** si la data ya existe.

---

## Problema central

**~50 voluntarias en Caracas** (de ~180 en el grupo general) que pueden ir físicamente a campo. La coordinación se pierde en WhatsApp:

- Quién tiene carro / camioneta y qué días
- Qué habilidades tiene cada una (profesión, oficio, fortalezas)
- Quién puede ir qué día a qué actividad
- Ren recibe demasiados mensajes; necesita **delegar** y que la información quede escrita, no enterrada en el chat

### Tareas típicas de las voluntarias

- Actividades recreativas con niños
- Cocinar y repartir comida
- Jugar / acompañar
- Apoyo psicológico
- Lo que surja al llegar al refugio

Ren ya hizo un **censo inicial** (nombre, apellido, cédula, profesión, oficio, fortalezas, etc.) pero no logra mantenerlo al día con el ritmo del chat.

---

## Fuentes de datos existentes

| Fuente | Responsable | Contenido | Notas |
|--------|-------------|-----------|-------|
| **Web de registro** | Dari (esposo, ingeniero) | [registro-voluntarias.web.app](https://registro-voluntarias.web.app/) | ~88 registros; panel admin con clave; evita que voluntarias vean datos de otras |
| **Excel General** | Renata | Formulario completo (~89 filas) | Respaldo masivo; en Drive, descargado para subir a la web |
| **Excel Caracas / La Guaira** | Dari | Logística de campo (~15 filas) | Transporte, zona, observaciones (ej. camioneta solo martes) |
| **Chat WhatsApp** | Ren | Info informal, horarios, acuerdos | Pendiente export para tabular |

### Jerarquía acordada (fuente de verdad)

1. **Web / Firestore** — registro vivo (quién está registrada)
2. **Excel General** — respaldo con todos los campos del formulario
3. **Excel Caracas** — capa logística de campo
4. **Chat** — información extra no capturada en formularios

### Grupos de WhatsApp

- **~180** en el grupo general (varios países: USA, Chile, Argentina, Venezuela…)
- **~50** en subgrupo Caracas (quienes pueden ir a campo)
- **~15** con logística confirmada para Caracas / La Guaira (al momento de la reunión)
- Grupo pequeño de coordinación: Renata, Yeudi, Dari y otras

---

## Necesidades expresadas

### Urgente (Ren)

1. **Censo estructurado** del grupo de Caracas: transporte, horarios, habilidades
2. **Subgrupos** propuestos: mujeres con coche, disponibles martes–jueves, etc.
3. **Delegación**: coordinadora de reclutamiento, alguien que reciba respuestas de “quién va qué día” sin pasar todo por Ren
4. No repetir formularios; migrar data existente

### Medio plazo (Dari + Ren)

1. **Calendario / eventos**: “salimos lunes, miércoles y sábado”; cada voluntaria se anota al día que puede
2. **Coordinación de tareas** vinculada al grupo de voluntarias
3. Branding / logo (mencionado con Yeudi para la web actual)

### Seguridad y verificación

- Datos de voluntarias son **PII** — no públicos (cédula, teléfono, dirección)
- Yeudi gestiona **permisos** para entrar a refugios; por eso hace falta nombre completo y cédula
- **Declaración jurada** en el registro: la voluntaria declara ser persona responsable (texto definido por Ren)
- Base de datos de **niños** la maneja Yeudi, no Dari; no compartir identificación de menores en esta fase — solo cantidades y necesidades agregadas (leche, pañales, etc.)

---

## Decisiones de la reunión

| # | Decisión |
|---|----------|
| 1 | **No parar el registro actual** mientras ForVzla construye; cuando esté listo, reemplazar el link |
| 2 | **Integrar en ForVzla** (forvzla.vercel.app) en lugar de seguir solo en la web de Dari — desarrollo más rápido, ya desplegado |
| 3 | Sección dedicada **“Cuidadoras Caracas”** (no el home completo del mapa SOS) |
| 4 | ForVzla **migra automáticamente** la data existente; las voluntarias no re-digititan |
| 5 | Dari comparte: credenciales admin web, Excel General, Excel Caracas, export del chat del grupo de ~50 |
| 6 | Angélisa + Dari en contacto directo para tecnología; María Cristina con Ren + Yeudi para logística |
| 7 | Reunión de seguimiento **lunes** con Ren y Yeudi para afinar coordinación (fase 2) |

---

## Lo implementado en ForVzla (post-reunión)

| Entrega | Detalle |
|---------|---------|
| Tabla `voluntarios` | Campo `grupo = 'cuidadoras_caracas'`; antiduplicado por `(grupo, id_dni)` |
| Formulario público | 3 pasos: datos + dirección → profesión/disponibilidad/logística → tareas y declaración jurada |
| Import masivo | **87** registros desde Excel/web; 7 omitidos (datos incompletos); 1 duplicado (Auri) |
| Admin | Pestaña **👩‍👧 Voluntarias** en `/admin.html` |
| URLs | `/cuidadoras-caracas` · `/voluntarios/cuidadoras-caracas` |
| Commit | `850e8d0` en `master` (6 jul 2026) |

### Enlace para que Dari comparta con el grupo

```
https://forvzla.vercel.app/cuidadoras-caracas
```

### Pendiente de datos (7 personas sin registro completo)

- Excel General: Mayra (sin cédula), Panuncio (solo apellido)
- Excel Caracas: Natascha, Yrma, Graciela, Thais, Lisbeth (sin teléfono en la hoja)

### Fase 2 (acordada, no iniciada)

- Módulo de **eventos y calendario** (quién va qué día)
- **Subgrupos** automáticos por transporte / disponibilidad
- Integración con necesidades de niños (cantidades agregadas, sin PII de menores)
- Export / análisis del chat de WhatsApp

---

## Acciones y responsables

| Acción | Quién | Estado |
|--------|-------|--------|
| Compartir Excel General + Caracas + clave admin web | Dari → ForVzla | ✅ Recibido y procesado |
| Terminar Excel logística Caracas/La Guaira (transporte por día) | Dari | En curso (reunión) |
| Export chat grupo ~50 voluntarias | Ren / Dari | Pendiente |
| Desplegar formulario ForVzla y pasar link a Ren | Angélisa | ✅ Desplegado |
| Aplicar migraciones SQL (`registrar_voluntario`) en Supabase | Angélisa / Dari | Verificar en prod |
| Reunión lunes: Ren + Yeudi + ForVzla | María Cristina | Pendiente |
| Grupo WhatsApp con Yeudi + ForVzla | María Cristina | Pendiente |
| Redeploy scraper Railway (fallback registro) | Angélisa | Pendiente |

---

## Notas técnicas (para el equipo)

- En Venezuela **no hay acceso** a ChatGPT / Claude; el desarrollo con IA se hace desde España.
- La web de Dari usa Firestore + panel con contraseña; ForVzla usa **Supabase** con RLS (insert público, lectura solo admin).
- Ren pidió explícitamente no sobrecargar con formularios: el mensaje a coordinación es **“sigue el link nuevo cuando esté; la data vieja ya la tenemos”**.

---

## Citas relevantes

> *“No quiero volverle a pedir a la misma gente que vuelva a llenar más formularios.”* — Ren

> *“Nosotros tenemos migradores automáticos… toda la data que pases la podemos llevar a una base de datos organizada.”* — Angélisa

> *“Tipo un Excel… qué puede hacer cada una… muchas pusieron si cuentan con carro, horario…”* — Ren

> *“Cuando yo tenga listo este mismo formulario en la otra página se los voy a pasar y ustedes lo van a reemplazar.”* — Angélisa

> *“No paren el registro por esto que nosotros vamos a hacer. Nosotros lo vamos a completar cuando esté listo.”* — Angélisa

---

## Referencias internas

- Migraciones: `supabase/migrations/20250705230000_voluntarios_grupos.sql`, `…30100…`, `…30200…`
- Formulario: `public/cuidadoras-caracas.html`
- Import: `scripts/import_voluntarios_maestro.js`
- Datos de trabajo (PII, gitignored): `data/voluntarias_maestro.json`
