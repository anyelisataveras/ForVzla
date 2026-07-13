-- Plantillas de carnet por grupo + cola async de generación PDF.

-- ─── Plantillas ─────────────────────────────────────────────────────────────
create table if not exists carnet_plantillas (
  grupo     text primary key references grupos_voluntarios(slug) on delete cascade,
  activo    boolean not null default true,
  config    jsonb not null default '{}'::jsonb,
  version   int not null default 1,
  updated_at timestamptz not null default now()
);

comment on table carnet_plantillas is
  'Config nativa por grupo (layout/dimensiones). Canva solo referencia de diseño.';
comment on column carnet_plantillas.config is
  'JSON: canva_url, dimensions, template_slug, field layout — ver seed cuidadoras_caracas.';

insert into carnet_plantillas (grupo, activo, config, version)
values (
  'cuidadoras_caracas',
  true,
  jsonb_build_object(
    'template_slug', 'cuidadoras_caracas_v1',
    'canva_url', 'https://canva.link/03vyok16l02lf14',
    'dimensions', jsonb_build_object(
      'note', 'Tamaño impresión = plantilla Canva (PM 2026-07-12). Ajustar width_mm/height_mm en render-worker.',
      'width_mm', null,
      'height_mm', null
    ),
    'fields', jsonb_build_array('foto', 'nombre', 'apellido', 'id_dni', 'numero_voluntaria')
  ),
  1
)
on conflict (grupo) do update set
  activo = excluded.activo,
  config = excluded.config,
  version = excluded.version,
  updated_at = now();

-- ─── Jobs de generación ─────────────────────────────────────────────────────
create table if not exists carnet_generaciones (
  id                  uuid primary key default gen_random_uuid(),
  voluntario_id       uuid not null references voluntarios(id) on delete cascade,
  grupo               text not null,
  status              text not null default 'queued'
                        check (status in ('queued', 'processing', 'ready', 'failed')),
  error               text,
  output_storage_path text,
  snapshot            jsonb not null default '{}'::jsonb,
  regeneracion        boolean not null default false,
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz
);

create index if not exists carnet_generaciones_vol_idx
  on carnet_generaciones (voluntario_id, created_at desc);
create index if not exists carnet_generaciones_grupo_status_idx
  on carnet_generaciones (grupo, status, created_at desc);

-- Una sola job en vuelo por voluntaria
create unique index if not exists carnet_generaciones_one_inflight
  on carnet_generaciones (voluntario_id)
  where status in ('queued', 'processing');

create or replace function public.set_carnet_generacion_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select v.grupo into new.grupo
  from voluntarios v
  where v.id = new.voluntario_id;

  if new.grupo is null then
    raise exception 'Voluntaria no encontrada';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_carnet_generacion_grupo on carnet_generaciones;
create trigger trg_carnet_generacion_grupo
  before insert on carnet_generaciones
  for each row execute function set_carnet_generacion_grupo();

alter table carnet_plantillas enable row level security;
alter table carnet_generaciones enable row level security;

revoke all on table carnet_plantillas from anon, authenticated;
revoke all on table carnet_generaciones from anon, authenticated;

-- ─── Tokens lectura PDF (signed URL cliente) ──────────────────────────────────
create table if not exists carnet_generado_read_tokens (
  id             uuid primary key default gen_random_uuid(),
  generacion_id  uuid not null references carnet_generaciones(id) on delete cascade,
  voluntario_id  uuid not null references voluntarios(id) on delete cascade,
  storage_path   text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists carnet_generado_read_path_idx
  on carnet_generado_read_tokens (storage_path, expires_at desc);

alter table carnet_generado_read_tokens enable row level security;
revoke all on table carnet_generado_read_tokens from anon, authenticated;

create or replace function public.carnet_generado_read_path_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from carnet_generado_read_tokens t
    where t.storage_path = p_name and t.expires_at > now()
  );
$$;

grant execute on function public.carnet_generado_read_path_ok(text) to anon, authenticated;

-- Bucket PDFs generados (escribe render-worker con service_role)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'carnet-generados',
  'carnet-generados',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "carnet_generados_storage_select" on storage.objects;
drop policy if exists "carnet_generados_storage_insert" on storage.objects;
drop policy if exists "carnet_generados_storage_update" on storage.objects;

create policy "carnet_generados_storage_select"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'carnet-generados'
    and (
      is_admin()
      or is_moderador_grupo((storage.foldername(name))[1])
      or public.carnet_generado_read_path_ok(name)
    )
  );

-- Sin insert anon: solo service_role (Edge Function render-carnet)

-- ─── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public._carnet_plantilla_activa(p_grupo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from carnet_plantillas cp
    where cp.grupo = trim(p_grupo) and cp.activo = true
  );
$$;

create or replace function public._carnet_job_inflight(p_voluntario_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.id
  from carnet_generaciones g
  where g.voluntario_id = p_voluntario_id
    and g.status in ('queued', 'processing')
  limit 1;
$$;

create or replace function public._carnet_menu_subtitulo(
  p_template_available boolean,
  p_tiene_foto boolean,
  p_estado text
)
returns text
language sql
immutable
as $$
  select case
    when not p_template_available then 'No disponible'
    when p_estado in ('queued', 'processing') then 'Preparando…'
    when p_estado = 'ready' then 'Listo'
    when p_estado = 'failed' then 'Error — reintentar'
    when not p_tiene_foto then 'Aún no generado'
    else 'Aún no generado'
  end;
$$;

-- ─── RPC: disponibilidad (menú + plantilla) ───────────────────────────────────
create or replace function public.carnet_disponible(
  p_grupo text,
  p_voluntario_id uuid default null,
  p_plataforma text default null,
  p_usuario text default null,
  p_cedula4 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template boolean;
  v_cred_ok boolean := false;
  v_foto text;
  v_inflight uuid;
  v_ultimo record;
  v_estado text;
begin
  v_template := _carnet_plantilla_activa(p_grupo);

  if p_voluntario_id is null
     or trim(coalesce(p_plataforma, '')) = ''
     or trim(coalesce(p_usuario, '')) = '' then
    return jsonb_build_object(
      'ok', true,
      'template_available', v_template
    );
  end if;

  v_cred_ok := _voluntario_cred_ok(
    p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4
  );

  if not v_cred_ok then
    return jsonb_build_object(
      'ok', false,
      'error', 'No autorizado',
      'template_available', v_template
    );
  end if;

  select v.foto_storage_path into v_foto
  from voluntarios v
  where v.id = p_voluntario_id and v.grupo = trim(p_grupo);

  v_inflight := _carnet_job_inflight(p_voluntario_id);

  select g.status, g.id, g.completed_at
  into v_ultimo
  from carnet_generaciones g
  where g.voluntario_id = p_voluntario_id
  order by
    case when g.status in ('queued', 'processing') then 0 else 1 end,
    g.created_at desc
  limit 1;

  v_estado := coalesce(
    case when v_inflight is not null then
      (select status from carnet_generaciones where id = v_inflight)
    end,
    v_ultimo.status,
    null
  );

  return jsonb_build_object(
    'ok', true,
    'template_available', v_template,
    'tiene_foto', v_foto is not null and trim(v_foto) <> '',
    'tiene_carnet_listo', exists (
      select 1 from carnet_generaciones g
      where g.voluntario_id = p_voluntario_id and g.status = 'ready'
    ),
    'ultimo_estado', v_estado,
    'ultimo_job_id', coalesce(v_inflight, v_ultimo.id),
    'menu_subtitulo', _carnet_menu_subtitulo(
      v_template,
      v_foto is not null and trim(v_foto) <> '',
      v_estado
    )
  );
end;
$$;

-- ─── RPC: solicitar generación ────────────────────────────────────────────────
create or replace function public.solicitar_carnet(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_regenerar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol record;
  v_job_id uuid;
  v_ultimo_listo record;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if not _carnet_plantilla_activa(p_grupo) then
    return jsonb_build_object('ok', false, 'error', 'Carnet no disponible para este grupo', 'template_available', false);
  end if;

  if _carnet_job_inflight(p_voluntario_id) is not null then
    return jsonb_build_object('ok', false, 'error', 'Ya estamos preparando tu carnet', 'status', 'processing');
  end if;

  select v.id, v.grupo, v.nombre, v.apellido, v.id_dni, v.numero_voluntaria,
         v.foto_storage_path, v.foto_mime_type, v.foto_updated_at
  into v_vol
  from voluntarios v
  where v.id = p_voluntario_id and v.grupo = trim(p_grupo) and v.activa is not false;

  if v_vol.id is null then
    return jsonb_build_object('ok', false, 'error', 'Voluntaria no encontrada');
  end if;

  if v_vol.foto_storage_path is null or trim(v_vol.foto_storage_path) = '' then
    return jsonb_build_object('ok', false, 'error', 'Sube una foto antes de generar el carnet', 'necesita_foto', true);
  end if;

  if p_regenerar then
    select g.completed_at, g.created_at into v_ultimo_listo
    from carnet_generaciones g
    where g.voluntario_id = p_voluntario_id and g.status = 'ready'
    order by g.completed_at desc nulls last, g.created_at desc
    limit 1;

    if v_ultimo_listo.completed_at is not null
       and (v_vol.foto_updated_at is null or v_vol.foto_updated_at <= v_ultimo_listo.completed_at) then
      return jsonb_build_object(
        'ok', false,
        'error', 'Sube una foto nueva para regenerar el carnet',
        'necesita_foto_nueva', true
      );
    end if;
  end if;

  insert into carnet_generaciones (
    voluntario_id, grupo, status, regeneracion, snapshot
  ) values (
    p_voluntario_id,
    trim(p_grupo),
    'queued',
    p_regenerar,
    jsonb_build_object(
      'nombre', v_vol.nombre,
      'apellido', v_vol.apellido,
      'id_dni', v_vol.id_dni,
      'numero_voluntaria', v_vol.numero_voluntaria,
      'foto_storage_path', v_vol.foto_storage_path,
      'foto_mime_type', v_vol.foto_mime_type,
      'foto_updated_at', v_vol.foto_updated_at
    )
  )
  returning id into v_job_id;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'status', 'queued'
  );
end;
$$;

-- ─── RPC: estado (polling UI) ─────────────────────────────────────────────────
create or replace function public.estado_carnet(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_read_expires timestamptz;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if p_job_id is not null then
    select g.* into v_job
    from carnet_generaciones g
    where g.id = p_job_id and g.voluntario_id = p_voluntario_id;
  else
    select g.* into v_job
    from carnet_generaciones g
    where g.voluntario_id = p_voluntario_id
    order by
      case when g.status in ('queued', 'processing') then 0 else 1 end,
      g.created_at desc
    limit 1;
  end if;

  if v_job.id is null then
    return jsonb_build_object('ok', true, 'status', null, 'tiene_job', false);
  end if;

  if v_job.status = 'ready' and v_job.output_storage_path is not null then
    delete from carnet_generado_read_tokens
    where generacion_id = v_job.id and expires_at < now();

    v_read_expires := now() + interval '5 minutes';

    insert into carnet_generado_read_tokens (
      generacion_id, voluntario_id, storage_path, expires_at
    ) values (
      v_job.id, p_voluntario_id, v_job.output_storage_path, v_read_expires
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'tiene_job', true,
    'job_id', v_job.id,
    'status', v_job.status,
    'error', v_job.error,
    'output_storage_path', case when v_job.status = 'ready' then v_job.output_storage_path else null end,
    'read_expires_at', case when v_job.status = 'ready' then v_read_expires else null end,
    'completed_at', v_job.completed_at,
    'snapshot', v_job.snapshot
  );
end;
$$;

-- ─── RPC: descarga PDF ────────────────────────────────────────────────────────
create or replace function public.url_descarga_carnet(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_num int;
  v_read_expires timestamptz;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select g.* into v_job
  from carnet_generaciones g
  where g.voluntario_id = p_voluntario_id
    and g.status = 'ready'
    and g.output_storage_path is not null
  order by g.completed_at desc nulls last, g.created_at desc
  limit 1;

  if v_job.id is null then
    return jsonb_build_object('ok', false, 'error', 'Aún no hay carnet listo para descargar');
  end if;

  select v.numero_voluntaria into v_num
  from voluntarios v where v.id = p_voluntario_id;

  v_read_expires := now() + interval '5 minutes';

  delete from carnet_generado_read_tokens
  where generacion_id = v_job.id and expires_at < now();

  insert into carnet_generado_read_tokens (
    generacion_id, voluntario_id, storage_path, expires_at
  ) values (
    v_job.id, p_voluntario_id, v_job.output_storage_path, v_read_expires
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'storage_path', v_job.output_storage_path,
    'read_expires_at', v_read_expires,
    'filename', 'carnet-' || trim(p_grupo) || '-' || coalesce(v_num::text, p_voluntario_id::text) || '.pdf'
  );
end;
$$;

-- ─── RPC: worker render (story 3) — marcar estados ───────────────────────────
create or replace function public.claim_carnet_job(p_job_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
begin
  if p_job_id is not null then
    update carnet_generaciones g
    set status = 'processing', started_at = coalesce(g.started_at, now())
    where g.id = p_job_id and g.status = 'queued'
    returning g.* into v_job;
  else
    update carnet_generaciones g
    set status = 'processing', started_at = now()
    where g.id = (
      select id from carnet_generaciones
      where status = 'queued'
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning g.* into v_job;
  end if;

  if v_job.id is null then
    return jsonb_build_object('ok', false, 'error', 'No hay jobs en cola');
  end if;

  return jsonb_build_object(
    'ok', true,
    'job', jsonb_build_object(
      'id', v_job.id,
      'voluntario_id', v_job.voluntario_id,
      'grupo', v_job.grupo,
      'snapshot', v_job.snapshot,
      'regeneracion', v_job.regeneracion
    )
  );
end;
$$;

create or replace function public.completar_carnet_job(
  p_job_id uuid,
  p_output_storage_path text,
  p_ok boolean default true,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vol uuid;
  v_old_paths text[];
begin
  if not p_ok then
    update carnet_generaciones
    set status = 'failed', error = left(coalesce(p_error, 'Error al generar'), 500), completed_at = now()
    where id = p_job_id and status in ('queued', 'processing');
    return jsonb_build_object('ok', FOUND);
  end if;

  if trim(coalesce(p_output_storage_path, '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta ruta de salida');
  end if;

  update carnet_generaciones g
  set
    status = 'ready',
    output_storage_path = trim(p_output_storage_path),
    error = null,
    completed_at = now()
  where g.id = p_job_id and g.status in ('queued', 'processing')
  returning g.voluntario_id into v_vol;

  if v_vol is null then
    return jsonb_build_object('ok', false, 'error', 'Job no encontrado o ya finalizado');
  end if;

  select array_agg(g.output_storage_path) into v_old_paths
  from carnet_generaciones g
  where g.voluntario_id = v_vol
    and g.status = 'ready'
    and g.id <> p_job_id
    and g.output_storage_path is not null;

  update carnet_generaciones
  set status = 'failed', error = 'Reemplazado por carnet más reciente'
  where voluntario_id = v_vol
    and status = 'ready'
    and id <> p_job_id;

  if v_old_paths is not null then
    delete from storage.objects o
    where o.bucket_id = 'carnet-generados'
      and o.name = any (v_old_paths);
  end if;

  return jsonb_build_object('ok', true, 'job_id', p_job_id);
end;
$$;

grant execute on function public.carnet_disponible(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.solicitar_carnet(uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.estado_carnet(uuid, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.url_descarga_carnet(uuid, text, text, text, text) to anon, authenticated;

-- Worker RPCs: invocar con service_role desde Edge Function (no exponer a anon)
revoke execute on function public.claim_carnet_job(uuid) from anon, authenticated;
revoke execute on function public.completar_carnet_job(uuid, text, boolean, text) from anon, authenticated;
grant execute on function public.claim_carnet_job(uuid) to service_role;
grant execute on function public.completar_carnet_job(uuid, text, boolean, text) to service_role;

comment on function public.carnet_disponible is
  'Sin cred: solo template_available. Con cred: estado menú Mi carnet.';
comment on function public.solicitar_carnet is
  'Encola job queued. Regenerar exige foto_updated_at posterior al último ready.';
comment on function public.estado_carnet is
  'Polling UI; emite read token 5 min cuando status=ready.';
comment on function public.claim_carnet_job is
  'Render worker (service_role): queued → processing.';
comment on function public.completar_carnet_job is
  'Render worker (service_role): marca ready/failed y limpia PDFs viejos.';
