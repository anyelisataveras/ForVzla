# Prompt para Guau — Feature Refugios Venezuela (Apadrinar / Adoptar)

> Copia y pega este prompt en Cursor (repo Guau) o entrégalo al equipo de producto/diseño.

---

## Prompt

```
Contexto
--------
Guau (guau.app) es una app de coordinación de cuidado de mascotas: perfiles, equipo de cuidado, tareas, historial y modo mascota perdida. ForVzla (forvzla.vercel.app) es un mapa SOS post-terremoto en Venezuela que conecta necesidades urgentes con voluntarios por proximidad.

Queremos un módulo nuevo en Guau para refugios de animales afectados por el terremoto del 24-jun-2026 en Venezuela. ForVzla mostrará enlaces hacia Guau; Guau debe mostrar enlaces de vuelta al SOS en ForVzla cuando exista.

Contrato de integración (obligatorio)
--------------------------------------
Lee y respeta el contrato en ForVzla: docs/guau-forvzla-integration.md
Mockup de referencia: ForVzla/public/mockup-guau-refugios.html

URLs:
- Listado: GET /refugios-ve
- Refugio: GET /refugios-ve/{slug}
- Animal: GET /refugios-ve/{slug}/animales/{id}
- Query params entrantes: utm_source, utm_medium, need (UUID ForVzla), refugio, animal, zona, accion (apadrinar|adoptar|donar)

Objetivo del feature
--------------------
Permitir que personas dentro y fuera de Venezuela:
1. Descubran refugios verificados afectados por el terremoto
2. Apadrinen un animal concreto o el refugio en general (comida / dinero)
3. Expresen interés en adoptar (sin adopción automática en v1)
4. Sigan updates del refugio o del animal (fotos, notas de salud)

NO es objetivo en v1:
- Procesar pagos dentro de Guau (mostrar métodos de pago del refugio: Pago Móvil, Zelle, etc.)
- Logística internacional de envío de comida
- Verificación veterinaria automatizada

Usuario piloto
--------------
Refugio Ira Núñez — Ocumare de la Costa, Aragua
- 64+ animales en albergue, ~150 callejeros en 24 sectores
- Urgente: perrarina/gatarina, reparación pared/techo, brigada veterinaria
- Slug sugerido: ira-ocumare

Pantallas a implementar
-----------------------

1. /refugios-ve — Listado
   - Hero: "Refugios de animales · Terremoto Venezuela 2026"
   - Sub: "Apadrina, adopta o envía ayuda a refugios verificados"
   - Tarjetas: foto, nombre, zona, N animales, badge urgencia, botones "Ver refugio" / "Apadrinar"
   - Filtro por estado (Aragua, Miranda, …) — opcional v1
   - Footer link: "¿Emergencia urgente? Ver mapa en ForVzla" → forvzla con utm_source=guau
   - Si llega ?need=uuid, banner: "Llegaste desde una emergencia en ForVzla" + link al SOS

2. /refugios-ve/{slug} — Perfil refugio
   - Header: foto, nombre, zona, contacto (solo tras acción o visible según política)
   - Stats: animales total, apadrinados, sectores callejeros
   - Sección "Necesitan ahora": comida kg/mes, materiales, vet
   - Botón prominente: "🐾 Apadrinar este refugio"
   - Botón secundario: "Ver emergencia en ForVzla" (si necesidad_id existe)
   - Grid de animales apadrinables/adoptables (foto, nombre, chip Apadrinar/Adoptar)
   - Métodos de pago del refugio (jsonb)
   - Timeline de updates del refugio (texto + foto, estilo historial Guau)

3. /refugios-ve/{slug}/animales/{id} — Perfil animal
   - Reutilizar UI de perfil mascota Guau donde aplique
   - Nombre, foto, especie, edad aprox, historia corta
   - Estado: "Busca padrino" / "Busca hogar" / "Apadrinado"
   - Botones: Apadrinar · Me interesa adoptar
   - Historial público: updates del refugio sobre este animal
   - Breadcrumb: Refugios > {refugio} > {animal}

4. Flujo Apadrinar (modal o página /refugios-ve/apadrinar)
   Pasos mínimos:
   a) ¿A quién apadrinas? — animal específico | refugio en general (pre-seleccionar si ?animal= o ?accion=apadrinar)
   b) ¿Cómo quieres ayudar? — chips: Donación mensual | Donación única | Enviar comida física
   c) Monto sugerido o descripción (ej: "1 bolsa perrarina/mes", "$10/mes")
   d) Tus datos: nombre*, email*, país, teléfono/WhatsApp opcional
   e) Pantalla confirmación: métodos de pago del refugio + "Avísale al refugio por WhatsApp" (deep link wa.me)
   f) Guardar en apadrinamientos con estado 'interesado', utm_source, need_id

5. Flujo Adoptar (interés, no adopción instantánea)
   - Formulario: nombre, email, país, teléfono, mensaje ("¿Por qué quieres adoptar?")
   - Checkbox: "Entiendo que el refugio me contactará para evaluar el caso"
   - Submit → notificar refugio (email/WhatsApp) + confirmación al usuario
   - NO prometer adopción automática

Modelo de datos (Supabase compartido con ForVzla o API propia)
---------------------------------------------------------------
Tablas: refugios, animales_refugio, apadrinamientos
Ver esquema en docs/guau-forvzla-integration.md §7

Campos clave refugios:
- slug, nombre, necesidad_id (FK ForVzla), verificado, metodos_pago jsonb, necesita_mensual

RLS:
- Lectura pública: refugios verificados + animales
- Insert apadrinamientos: anónimo con rate limit
- Escritura refugio: solo admin o token del refugio (v2)

Diseño / UX
-----------
- Español venezolano, tono cálido y directo, mobile-first
- Paleta Guau existente; acento refugios: ámbar/cálido (#D97706 / #FFF7ED) para distinguir de features core
- Mínimo tipeo; preferir chips y botones
- Fotos de animales prominentes (conexión emocional)
- Confianza: badge "Refugio verificado" solo si verificado=true + link a SOS ForVzla

Integración ForVzla (saliente desde Guau)
-----------------------------------------
En perfil refugio:
  "Ver emergencia en ForVzla" → {FORVZLA_ORIGIN}/?need={necesidad_id}&utm_source=guau&utm_medium=refugio_profile

En listado:
  "¿Necesitas ayuda urgente para tu refugio?" → ForVzla reportar SOS

Reutilizar features Guau existentes
------------------------------------
- Perfil mascota → base para animales_refugio
- Equipo de cuidado → refugio owner + voluntarios + padrinos (solo lectura updates)
- Historial / timeline → updates del refugio a padrinos
- Tareas → opcional v2: turnos alimentación por sector (24 sectores Ocumare)
- Lost Pet Mode → NO usar en v1 para refugios

MVP (2 semanas)
---------------
Semana 1:
- [ ] Ruta /refugios-ve + /refugios-ve/ira-ocumare estática o con Supabase
- [ ] 1 refugio piloto + 5 animales de ejemplo con fotos
- [ ] Flujo apadrinar completo (sin cobro in-app)
- [ ] Parse query params utm_* y need
- [ ] Link saliente a ForVzla

Semana 2:
- [ ] Flujo adoptar (interés)
- [ ] Admin mínimo: ver apadrinamientos, marcar verificado
- [ ] Refugio puede postear 1 update (texto + foto)
- [ ] Email o webhook al refugio cuando alguien apadrina

Criterios de aceptación
-----------------------
- Desde ForVzla home, click "Ayudar a refugios de animales" llega a /refugios-ve con utm_source=forvzla
- Desde tarjeta SOS con ?need=uuid, Guau muestra banner contextual
- Apadrinar guarda registro con need_id y utm_medium
- Perfil refugio enlaza de vuelta al pin ForVzla
- Flujo completo en móvil < 3 minutos, sin registro obligatorio de cuenta Guau en v1 (email basta)
- Copy en español venezolano, accesible, sin jerga técnica

Restricciones
-------------
- v1: NO Stripe/PayPal integrado — solo mostrar datos de pago del refugio
- v1: NO prometer adopción inmediata
- Verificar refugios manualmente antes de listar (flag verificado)
- Privacidad: no publicar teléfono del refugio en listado; sí en confirmación apadrinar o perfil

Entregables
-----------
1. Páginas/rutas descritas arriba
2. Migración Supabase (o equivalente)
3. Documentación actualizada del contrato si cambian URLs
4. Seed: refugio ira-ocumare + 5 animales

Empieza por el listado y el refugio piloto. Pregunta si falta acceso al repo ForVzla o a Supabase compartido.
```

---

## Notas para quien ejecute el prompt

- Adjuntar `mockup-guau-refugios.html` abierto en el navegador como referencia visual.
- Si Guau usa stack distinto (React Native, Next.js, etc.), adaptar rutas pero **mantener el contrato de URLs y query params**.
- Coordinar con ForVzla fase 1 (enlaces) en paralelo — no esperar a fase 3 de BD.
