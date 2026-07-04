# Contrato de integración ForVzla ↔ Guau

> **Versión:** 1.0 · **Fecha:** 2026-07-04  
> **Alcance:** Refugios de animales afectados por el terremoto en Venezuela  
> **Mockup:** `public/mockup-guau-refugios.html`

---

## 1. Principio rector

| Plataforma | Responsabilidad |
|------------|-----------------|
| **ForVzla** | Emergencia: SOS en mapa, proximidad, contacto urgente (tel / WhatsApp), confirmaciones |
| **Guau** | Vínculo a largo plazo: apadrinar, adoptar, historial del animal, equipo de cuidado |

ForVzla **no** implementa apadrinamiento ni adopciones. Guau **no** reemplaza el mapa de emergencia.

---

## 2. URLs base

| Entorno | ForVzla | Guau refugios |
|---------|---------|---------------|
| Producción | `https://forvzla.vercel.app` *(ajustar al dominio real)* | `https://guau.app/refugios-ve` |
| Desarrollo | `http://localhost:3000` | `http://localhost:5173/refugios-ve` *(ajustar al stack Guau)* |

---

## 3. Rutas Guau (destino)

| Ruta | Descripción |
|------|-------------|
| `GET /refugios-ve` | Listado de refugios verificados en Venezuela |
| `GET /refugios-ve/{slug}` | Perfil del refugio (ej. `ira-ocumare`) |
| `GET /refugios-ve/{slug}/animales/{animal_id}` | Perfil del animal |
| `GET /refugios-ve/apadrinar` | Flujo apadrinar (query params abajo) |
| `GET /refugios-ve/adoptar` | Flujo interés de adopción (query params abajo) |

---

## 4. Query parameters (ForVzla → Guau)

Todos los enlaces desde ForVzla **deben** incluir `utm_source=forvzla`.

| Parámetro | Obligatorio | Descripción | Ejemplo |
|-----------|-------------|-------------|---------|
| `utm_source` | Sí | Origen fijo | `forvzla` |
| `utm_medium` | Recomendado | Ubicación del enlace | `home`, `ayudar_card`, `map_popup`, `share`, `info_modal` |
| `need` | Opcional | UUID de `necesidades.id` en Supabase ForVzla | `a1b2c3d4-…` |
| `refugio` | Opcional | Slug del refugio en Guau (cuando exista) | `ira-ocumare` |
| `animal` | Opcional | UUID del animal en Guau | `e5f6…` |
| `zona` | Opcional | Zona legible (URL-encoded) | `Ocumare%20de%20la%20Costa` |
| `accion` | Opcional | Pre-selección de flujo | `apadrinar`, `adoptar`, `donar` |

### Ejemplos de enlaces

```
# Home ForVzla → listado Guau
https://guau.app/refugios-ve?utm_source=forvzla&utm_medium=home

# Tarjeta SOS de refugio → perfil Guau (con fallback a listado si slug desconocido)
https://guau.app/refugios-ve/ira-ocumare?utm_source=forvzla&utm_medium=ayudar_card&need={uuid}

# SOS sin slug verificado aún → listado con contexto
https://guau.app/refugios-ve?utm_source=forvzla&utm_medium=ayudar_card&need={uuid}&zona=Ocumare%20de%20la%20Costa&accion=apadrinar

# Animal concreto
https://guau.app/refugios-ve/ira-ocumare/animales/{animal_id}?utm_source=forvzla&utm_medium=ayudar_card&need={uuid}&accion=apadrinar

# Compartir WhatsApp desde ForVzla
https://guau.app/refugios-ve/ira-ocumare?utm_source=forvzla&utm_medium=share&need={uuid}
```

---

## 5. Query parameters (Guau → ForVzla)

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `need` | Abrir / resaltar pin del SOS | `?need=a1b2c3d4-…` |
| `lat`, `lng` | Centrar mapa (si no hay `need`) | `?lat=10.46&lng=-67.78` |
| `view` | Vista inicial | `ayudar`, `mapa` |
| `utm_source` | Origen | `guau` |

### Ejemplos

```
# Desde perfil refugio en Guau → SOS urgente en ForVzla
https://forvzla.vercel.app/?need={uuid}&utm_source=guau&utm_medium=refugio_profile

# Ver mapa cerca del refugio
https://forvzla.vercel.app/?view=ayudar&lat=10.4655&lng=-67.7765&utm_source=guau
```

---

## 6. Detección de refugio en ForVzla (Nivel 2)

Un SOS se considera **refugio de animales** si cumple **al menos una**:

1. Campo futuro `refugio_guau_slug` no nulo en `necesidades` o tabla `refugios`
2. Heurística en descripción/tipos/otro (hasta tener BD):

```javascript
const REFUGIO_KW = /\b(refugio|albergue|animal|animalito|perr|gato|mascota|perrarina|gatarina|calleyer)\b/i;

function isRefugioNeed(n) {
  if (n.refugio_guau_slug) return true;
  const text = [n.descripcion, n.otro, n.cantidad, ...(n.tipos||[]), n.tipo].filter(Boolean).join(' ');
  return REFUGIO_KW.test(text);
}
```

Si `isRefugioNeed(n)`:
- Mostrar badge `🐾 Refugio de animales`
- Mostrar botón `Apadrinar en Guau` (URL según §4)
- Incluir enlace Guau al compartir (`shareNeed`)

---

## 7. Modelo de datos compartido (Nivel 3)

Supabase ForVzla — tablas nuevas (Guau lee vía API o Supabase client con RLS):

```sql
refugios (
  id uuid PK,
  slug text UNIQUE NOT NULL,           -- 'ira-ocumare'
  nombre text NOT NULL,
  necesidad_id uuid REFERENCES necesidades(id),
  zona text, lat double, lng double,
  contacto_nombre text, telefono text, whatsapp text,
  descripcion text, animales_total int,
  foto_url text, verificado boolean DEFAULT false,
  metodos_pago jsonb,                  -- { pago_movil, zelle, binance, ... }
  necesita_mensual text,               -- '80 kg perrarina/mes'
  created_at timestamptz
)

animales_refugio (
  id uuid PK,
  refugio_id uuid REFERENCES refugios(id),
  nombre text NOT NULL,
  especie text CHECK (especie IN ('perro','gato','otro')),
  foto_url text, historia text,
  apadrinable boolean DEFAULT true,
  adoptable boolean DEFAULT false,
  apadrinado boolean DEFAULT false,
  created_at timestamptz
)

apadrinamientos (
  id uuid PK,
  refugio_id uuid, animal_id uuid NULL,  -- null = apoyo al refugio general
  padrino_nombre text, padrino_email text,
  padrino_pais text, padrino_telefono text,
  tipo text CHECK (tipo IN ('mensual','unico','comida_fisica')),
  monto_o_descripcion text,
  estado text DEFAULT 'interesado',
  utm_source text, need_id uuid,
  created_at timestamptz
)
```

**Enlace bidireccional:**
- `refugios.necesidad_id` → pin ForVzla
- `refugios.slug` → URL Guau
- Guau muestra `necesidad_id` para botón "Ver emergencia en ForVzla"

---

## 8. Constantes en ForVzla (`index.html`)

```javascript
const GUAU_REFUGIOS_BASE = 'https://guau.app/refugios-ve';

function guauRefugioUrl(opts = {}) {
  const { slug, needId, zona, animalId, accion, medium = 'link' } = opts;
  let path = GUAU_REFUGIOS_BASE;
  if (slug) path += '/' + encodeURIComponent(slug);
  if (animalId && slug) path += '/animales/' + encodeURIComponent(animalId);
  const q = new URLSearchParams({ utm_source: 'forvzla', utm_medium: medium });
  if (needId) q.set('need', needId);
  if (zona) q.set('zona', zona);
  if (accion) q.set('accion', accion);
  return path + '?' + q.toString();
}

function forvzlaNeedUrl(needId, medium = 'guau') {
  const q = new URLSearchParams({ need: needId, utm_source: 'guau', utm_medium: medium });
  return location.origin + '/?' + q.toString();
}
```

---

## 9. Analytics

| Evento ForVzla | Cuándo |
|----------------|--------|
| `GUAU_LINK_CLICKED` | Cualquier enlace a Guau |
| `GUAU_LINK_SHOWN` | Tarjeta con badge refugio renderizada |

Propiedades: `{ medium, need_id, refugio_slug, accion }`

Guau debe registrar equivalente: `forvzla_referral` con mismos params.

---

## 10. Copy oficial (español venezolano)

| Ubicación | Texto |
|-----------|-------|
| Botón more (tras Soy rescatista) | 🐾 Ayudar a refugios de mascotas |
| Badge tarjeta | 🐾 Refugio de mascotas |
| Botón tarjeta | 🐾 Apadrinar en Guau |
| Modal info | **Ayudar a refugios de mascotas** — refugios afectados por el terremoto. Apadrina, adopta o envía ayuda continua en Guau |
| Tip al publicar | ¿Eres refugio de mascotas afectado por el terremoto? Crea tu perfil en Guau → |
| Share suffix | 🐾 Apadrinar: {guau_url} |

---

## 11. Fases de implementación

| Fase | ForVzla | Guau |
|------|---------|------|
| **1** | Banner + botón + modal (solo links) | Landing `/refugios-ve` estática, 1 refugio piloto |
| **2** | Detección heurística + botón en tarjetas | Perfiles refugio + animales + flujo apadrinar |
| **3** | Tabla `refugios`, slug en tarjetas | API/Supabase, adopciones, updates a padrinos |
| **4** | Deep link `?need=` al abrir app | Deep link inverso, analytics cruzados |

---

## 12. Refugio piloto

| Campo | Valor |
|-------|-------|
| Nombre | Refugio Ira Núñez |
| Slug | `ira-ocumare` |
| Zona | Ocumare de la Costa, Aragua |
| Coordenadas aprox. | `10.4655, -67.7765` |
| Animales | 64+ en refugio, ~150 callejeros en 24 sectores |
| Urgencia | Comida (perrarina/gatarina), reparación estructural, brigada vet |
