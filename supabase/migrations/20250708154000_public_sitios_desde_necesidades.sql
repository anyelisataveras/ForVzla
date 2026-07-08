-- Permite crear/enlazar sitios públicos desde solicitudes institucionales.

alter table if exists sitios
  alter column grupo drop not null;

alter table if exists sitios
  add column if not exists origen text not null default 'grupo',
  add column if not exists ninos_custodia int,
  add column if not exists casos_especiales text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sitios_origen_check'
  ) then
    alter table sitios
      add constraint sitios_origen_check
      check (origen in ('grupo','publico'));
  end if;
end $$;

drop index if exists sitios_grupo_nombre_idx;
create unique index if not exists sitios_grupo_nombre_idx
  on sitios (coalesce(grupo, '__public__'), lower(nombre));

alter table if exists necesidades
  add column if not exists solicitante_tipo text not null default 'persona',
  add column if not exists sitio_tipo text,
  add column if not exists grupo_slug text,
  add column if not exists grupo_nombre text,
  add column if not exists ninos_total int,
  add column if not exists ninos_custodia int,
  add column if not exists casos_especiales text,
  add column if not exists sitio_id uuid references sitios(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'necesidades_solicitante_tipo_check'
  ) then
    alter table necesidades
      add constraint necesidades_solicitante_tipo_check
      check (solicitante_tipo in ('persona','sitio','grupo'));
  end if;
end $$;

create or replace function public.slugify_simple(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '_', 'g'))
$$;

create or replace function public.encontrar_o_crear_grupo_publico(
  p_nombre text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_base text;
  v_i int := 1;
begin
  if v_nombre = '' then
    return null;
  end if;

  select g.slug into v_slug
  from grupos_voluntarios g
  where lower(g.nombre) = lower(v_nombre)
  limit 1;

  if v_slug is not null then
    return v_slug;
  end if;

  v_base := slugify_simple(v_nombre);
  if v_base = '' then
    v_base := 'grupo_publico';
  end if;
  v_slug := v_base;

  while exists(select 1 from grupos_voluntarios g where g.slug = v_slug) loop
    v_i := v_i + 1;
    v_slug := v_base || '_' || v_i::text;
  end loop;

  insert into grupos_voluntarios (slug, nombre, descripcion, ruta_web, activo)
  values (v_slug, v_nombre, 'Grupo creado desde solicitud pública', '', true);

  return v_slug;
end;
$$;

create or replace function public.crear_o_enlazar_sitio_publico(
  p_nombre text,
  p_zona text,
  p_direccion text,
  p_lat double precision,
  p_lng double precision,
  p_personas_afectadas int default null,
  p_ninos_total int default null,
  p_ninos_custodia int default null,
  p_casos_especiales text default null,
  p_contacto_telefono text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_zona text := nullif(trim(coalesce(p_zona, '')), '');
  v_direccion text := nullif(trim(coalesce(p_direccion, '')), '');
begin
  if v_nombre = '' or p_lat is null or p_lng is null then
    return null;
  end if;

  select s.id
    into v_id
  from sitios s
  where lower(s.nombre) = lower(v_nombre)
    and s.lat is not null
    and s.lng is not null
    and _dist_m(p_lat, p_lng, s.lat, s.lng) <= 200
  order by case when s.grupo is null then 0 else 1 end, s.created_at desc
  limit 1;

  if v_id is not null then
    update sitios s
       set zona = coalesce(v_zona, s.zona),
           direccion = coalesce(v_direccion, s.direccion),
           personas_afectadas = coalesce(p_personas_afectadas, s.personas_afectadas),
           ninos_total = coalesce(p_ninos_total, s.ninos_total),
           ninos_custodia = coalesce(p_ninos_custodia, s.ninos_custodia),
           casos_especiales = coalesce(p_casos_especiales, s.casos_especiales),
           contacto_telefono = coalesce(nullif(trim(coalesce(p_contacto_telefono, '')), ''), s.contacto_telefono)
     where s.id = v_id
       and s.grupo is null;
    return v_id;
  end if;

  insert into sitios (
    grupo, origen, nombre, zona, direccion, lat, lng,
    personas_afectadas, ninos_total, ninos_custodia, casos_especiales,
    contacto_telefono, activo
  )
  values (
    null, 'publico', v_nombre, coalesce(v_zona, 'Otra'), v_direccion, p_lat, p_lng,
    p_personas_afectadas, p_ninos_total, p_ninos_custodia, p_casos_especiales,
    nullif(trim(coalesce(p_contacto_telefono, '')), ''), true
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_o_enlazar_sitio_publico(
  text, text, text, double precision, double precision, int, int, int, text, text
) to anon, authenticated;
