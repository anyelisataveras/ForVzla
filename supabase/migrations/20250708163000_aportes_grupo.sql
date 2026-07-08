-- Aportes prometidos a grupos de voluntariado (sin necesidad específica).
-- La donación formal en donaciones_grupo queda para confirmación por admin del grupo.

create table if not exists aportes_grupo (
  id               uuid primary key default gen_random_uuid(),
  grupo_slug       text not null references grupos_voluntarios(slug) on delete cascade,

  tipo_aporte      text not null
    check (tipo_aporte in ('comida','medicinas','agua','refugio','dinero','transporte','voluntariado','insumos','otro')),
  cantidad         numeric(12,2),
  unidad           text,
  descripcion      text,

  donante_nombre   text,
  donante_contacto text,

  estado           text not null default 'prometido'
    check (estado in ('prometido','confirmado','cancelado')),

  created_at       timestamptz not null default now()
);

create index if not exists aportes_grupo_slug_idx
  on aportes_grupo (grupo_slug, created_at desc);

alter table aportes_grupo enable row level security;

drop policy if exists "pub_read_aportes_grupo" on aportes_grupo;
drop policy if exists "pub_insert_aportes_grupo" on aportes_grupo;

create policy "pub_read_aportes_grupo"
  on aportes_grupo for select
  using (true);

create policy "pub_insert_aportes_grupo"
  on aportes_grupo for insert
  with check (true);

grant select, insert on table aportes_grupo to anon, authenticated;

create or replace function public.registrar_aporte_grupo_publico(
  p_grupo_slug text,
  p_tipo_aporte text,
  p_cantidad numeric default null,
  p_unidad text default null,
  p_descripcion text default null,
  p_donante_nombre text default null,
  p_donante_contacto text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text := trim(coalesce(p_grupo_slug, ''));
begin
  if v_slug = '' then
    raise exception 'Falta grupo_slug';
  end if;

  if not exists (
    select 1 from grupos_voluntarios g
    where g.slug = v_slug and g.activo = true
  ) then
    raise exception 'Grupo no encontrado';
  end if;

  if p_tipo_aporte not in ('comida','medicinas','agua','refugio','dinero','transporte','voluntariado','insumos','otro') then
    raise exception 'tipo_aporte inválido';
  end if;

  insert into public.aportes_grupo (
    grupo_slug, tipo_aporte, cantidad, unidad, descripcion,
    donante_nombre, donante_contacto, estado
  )
  values (
    v_slug,
    p_tipo_aporte,
    p_cantidad,
    nullif(trim(coalesce(p_unidad, '')), ''),
    nullif(trim(coalesce(p_descripcion, '')), ''),
    nullif(trim(coalesce(p_donante_nombre, '')), ''),
    nullif(trim(coalesce(p_donante_contacto, '')), ''),
    'prometido'
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.registrar_aporte_grupo_publico(
  text, text, numeric, text, text, text, text
) to anon, authenticated;

-- Los aportes públicos a necesidad tampoco crean donación formal hasta confirmación.
create or replace function public.registrar_aporte_publico(
  p_necesidad_id uuid,
  p_tipo_aporte text,
  p_cantidad numeric default null,
  p_unidad text default null,
  p_descripcion text default null,
  p_dono_como text default 'persona',
  p_grupo_nombre text default null,
  p_donante_nombre text default null,
  p_donante_contacto text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aporte_id uuid;
  v_grupo_slug text;
  v_desc text := nullif(trim(coalesce(p_descripcion, '')), '');
  v_contacto text := nullif(trim(coalesce(p_donante_contacto, '')), '');
  v_donante text := nullif(trim(coalesce(p_donante_nombre, '')), '');
  v_grupo_nombre text := nullif(trim(coalesce(p_grupo_nombre, '')), '');
begin
  if p_necesidad_id is null then
    raise exception 'Falta necesidad_id';
  end if;

  if p_tipo_aporte not in ('comida','medicinas','agua','refugio','dinero','transporte','voluntariado','insumos','otro') then
    raise exception 'tipo_aporte inválido';
  end if;

  if p_dono_como not in ('persona','institucion','grupo') then
    raise exception 'dono_como inválido';
  end if;

  if p_dono_como = 'grupo' and v_grupo_nombre is null then
    raise exception 'Falta nombre del grupo';
  end if;

  if p_dono_como = 'grupo' then
    v_grupo_slug := public.encontrar_o_crear_grupo_publico(v_grupo_nombre);
  end if;

  insert into public.aportes_necesidad (
    necesidad_id, tipo_aporte, cantidad, unidad, descripcion,
    dono_como, grupo_slug, donante_nombre, donante_contacto, estado
  )
  values (
    p_necesidad_id, p_tipo_aporte, p_cantidad, nullif(trim(coalesce(p_unidad, '')), ''), v_desc,
    p_dono_como, v_grupo_slug, v_donante, v_contacto, 'prometido'
  )
  returning id into v_aporte_id;

  return v_aporte_id;
end;
$$;
