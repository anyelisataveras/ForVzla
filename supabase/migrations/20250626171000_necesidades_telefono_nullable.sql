-- Permite solicitudes sin teléfono en el sitio (colapsos, víctimas sin línea).
-- El contacto puede ser null; la app exige detalle + ubicación en ese caso.

alter table necesidades alter column telefono drop not null;
