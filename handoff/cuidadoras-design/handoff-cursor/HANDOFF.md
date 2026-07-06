# Handoff — Módulo Coordinación Cuidadoras Caracas (ForVzla)

Prototipo de alta fidelidad, navegable, de todas las pantallas del spec §14
(`spec-cuidadoras-coordinacion-ui.md`). Para implementar en ForVzla como HTML/CSS/JS
inline (sin build), igual que `public/cuidadoras-caracas.html` y `public/admin.html`.

## Contenido del zip
- `HANDOFF.md` — este archivo.
- `Coordinacion Cuidadoras.dc.html` — prototipo completo (design component).
- `support.js` — runtime del design component (necesario para abrir el HTML en el navegador).

## Cómo abrirlo
Abre `Coordinacion Cuidadoras.dc.html` en un navegador (o sírvelo con cualquier server estático,
ej. `npx serve`). El botón **☰ Pantallas** (abajo a la derecha) permite saltar a cualquier pantalla.
Es sólo un prototipo de referencia visual/UX — **no** es el código final de producción.

## Pantallas incluidas
**Voluntaria (mobile-first, máx 580px)**
1. Landing del grupo — 3 caminos (registro / entrar / coordinadora).
2. Login voluntaria — red social + últimos 4 dígitos de cédula.
3. Mi cuenta — brigadas editables (chips multi-select) + próximas jornadas.
4. Lista de jornadas — cards con estado (abierta/llena/realizada/borrador).
5. Detalle jornada + RSVP — Voy/No puedo, transporte, notas, y **tareas sin dueño** ("Yo me encargo").

**Moderadora (responsive: sidebar en desktop, bottom-nav + FAB en móvil)**
6. Login moderadora (correo + contraseña, estilo `admin.html`).
7. Inicio (dashboard) — próxima jornada, stats transporte, acciones rápidas, resumen censo.
8. Voluntarias — buscador + filtros + cards (borde rojo = registro incompleto) + editar (hoja).
9. Brigadas — catálogo + coordinadora asignada.
10. Jornadas — pestañas Próximas/Pasadas/Borradores + crear jornada (hoja).
11. Detalle jornada moderadora — tabs Resumen / Confirmadas / Transporte / Tareas / Materiales.
12. Sitios — cobertura por tipo + anti-duplicado (`ayuda_duplicada`) + crear sitio (hoja).
13. Exportar — opciones para WhatsApp + preview + CSV.

**Sistema**
14. Página de design system (colores, chips de brigada, badges, botones, tipografía, TaskRow).

## Navegación de coordinadora (responsive)
- **Desktop (>820px):** sidebar con las 6 secciones.
- **Móvil (≤820px):** bottom-nav (Inicio · Voluntarias · ➕ nueva jornada · Jornadas · Más).
  "Más" abre una hoja con Brigadas / Sitios / Exportar. Todo alcanzable con el pulgar.

## Sistema de diseño (tokens exactos, heredados del registro)
Copiar tal cual de `cuidadoras-caracas.html`:
```
--bg #F1EEEA   --surf #FBFAF8  --ind #5A4AA0  --indh #4A3C88  --indl #EEEBF6  --indt #463A82
--grn #1E8449  --grnl #E9F6EE  --red #C0392B   --redl #FBEDEA
--txt #1C1A19  --txt2 #6B6560   --txt3 #9A938B  --line #E7E2DB  --line2 #E2DCD4
```
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`. Base 16px.
- Radios: cards 18px, inputs/botones 10–12px. Tap targets ≥44px.
- Colores por brigada (badges/chips):
  - Logística `#D6EAF8`/`#1A5276` 🍲 · Salud `#D5F5E3`/`#186A3B` 💊 · Donaciones `#FCF3CF`/`#7D6608` 📦
  - Saneamiento `#FAE5D3`/`#A04000` 🧹 · Recreación `#FADBD8`/`#922B21` ⚽
  - Contención `#E8DAEF`/`#6C3483` 💜 · Social `#D1F2EB`/`#117A65` 🤝
- Estado **sin dueño**: fondo `#FBEDEA`, borde `#f3d3cc`, texto `#C0392B`, ícono ⚠️.

## Rutas (implementación en ForVzla)
```
/cuidadoras-caracas                 Landing (3 caminos)
/cuidadoras-caracas/registro        Formulario 3 pasos (ya existe; añadir multi-select brigadas)
/cuidadoras-caracas/entrar          Login voluntaria
/cuidadoras-caracas/mi-cuenta       Brigadas + jornadas
/cuidadoras-caracas/jornadas        Lista jornadas
/cuidadoras-caracas/jornada/{id}    Detalle + RSVP + tareas
/cuidadoras-caracas/coord           Login moderadoras
/cuidadoras-caracas/coord/          Panel (?tab=inicio|voluntarias|brigadas|jornadas|sitios|exportar)
```

## Datos (mapeo a Supabase — ver spec §5)
Tablas: `voluntarios` (+ `brigadas text[]`, `login_usuario`, `activa`, `notas_internas`),
`brigadas`, `sitios`, `jornadas`, `tareas_jornada`, `necesidades_jornada`, `inscripciones`.
- Auth voluntaria: sesión en memoria (sin localStorage) — `red_social_plataforma` + `red_social_usuario` + últimos 4 de `id_dni`.
- Auth moderadora: Supabase Auth (como `admin.html`) + RLS `is_moderador_grupo('cuidadoras_caracas')`.
- Alerta transporte: rojo si `Σ cupos_ofrecidos < Σ inscripciones(necesita_transporte)`.
- Cerrar jornada: marcar asistencia + actualizar cobertura del sitio + `ayuda_duplicada`.

## Fuera de alcance v1 (no implementar)
- IA para sugerir brigadas. · Integración WhatsApp Business API (solo copiar/exportar texto).
- Inventario estructurado de medicamentos. · Expedientes legales / menores.

## Notas de implementación
- Los datos del prototipo son **ficticios** (Yrma, Cyndi, Kelly, Martha…). No usar como PII real.
- El prototipo usa el runtime de design components; en producción reescribir como HTML/JS inline
  siguiendo el patrón de `cuidadoras-caracas.html` (tokens en `:root`, componentes con clases).
- Sin `localStorage`/`sessionStorage`. Skeletons para 3G lento. Contraste WCAG AA.

## Proceso de entrega (spec §12)
1. Diseño en Claude Design (este handoff). 2. Revisión Angélisa + Cris. 3. Implementación en ForVzla.
4. Demo y validación con **Dari** (stakeholder principal).
