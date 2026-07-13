-- Foto de perfil voluntaria (carnet): storage privado + RPC con credenciales ligeras.

alter table voluntarios
  add column if not exists foto_storage_path text,
  add column if not exists foto_mime_type text,
  add column if not exists foto_updated_at timestamptz;

comment on column voluntarios.foto_storage_path is
  'Ruta en bucket voluntario-fotos ({grupo}/{voluntario_id}/...).';
comment on column voluntarios.foto_mime_type is
  'MIME de la foto activa (jpeg/png/webp/heic/heif).';

-- Tokens de subida (anon sube solo con path preparado + vigente)
create table if not exists voluntario_foto_upload_tokens (
  id             uuid primary key default gen_random_uuid(),
  voluntario_id  uuid not null references voluntarios(id) on delete cascade,
  grupo          text not null,
  storage_path   text not null,
  mime_type      text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now(),
  constraint voluntario_foto_upload_path_unique unique (storage_path)
);

create index if not exists voluntario_foto_upload_vol_idx
  on voluntario_foto_upload_tokens (voluntario_id, created_at desc);

-- Tokens de lectura corta (preview UI vía signed URL + policy)
create table if not exists voluntario_foto_read_tokens (
  id             uuid primary key default gen_random_uuid(),
  voluntario_id  uuid not null references voluntarios(id) on delete cascade,
  storage_path   text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists voluntario_foto_read_path_idx
  on voluntario_foto_read_tokens (storage_path, expires_at desc);

alter table voluntario_foto_upload_tokens enable row level security;
alter table voluntario_foto_read_tokens enable row level security;

-- Sin acceso directo a tablas de tokens; solo RPC security definer
revoke all on table voluntario_foto_upload_tokens from anon, authenticated;
revoke all on table voluntario_foto_read_tokens from anon, authenticated;

create or replace function public._vol_foto_mime_ok(p_mime text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_mime, ''))) = any (array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]);
$$;

create or replace function public._vol_foto_ext(p_mime text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_mime, '')))
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/heic' then 'heic'
    when 'image/heif' then 'heif'
    else null
  end;
$$;

create or replace function public.voluntario_foto_upload_path_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from voluntario_foto_upload_tokens t
    where t.storage_path = p_name
      and t.used_at is null
      and t.expires_at > now()
  );
$$;

create or replace function public.voluntario_foto_read_path_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from voluntario_foto_read_tokens t
    where t.storage_path = p_name
      and t.expires_at > now()
  );
$$;

grant execute on function public.voluntario_foto_upload_path_ok(text) to anon, authenticated;
grant execute on function public.voluntario_foto_read_path_ok(text) to anon, authenticated;

-- Bucket privado, máx 5 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voluntario-fotos',
  'voluntario-fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "voluntario_fotos_storage_select" on storage.objects;
drop policy if exists "voluntario_fotos_storage_insert" on storage.objects;
drop policy if exists "voluntario_fotos_storage_delete" on storage.objects;

create policy "voluntario_fotos_storage_select"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'voluntario-fotos'
    and (
      is_admin()
      or is_moderador_grupo((storage.foldername(name))[1])
      or public.voluntario_foto_read_path_ok(name)
    )
  );

create policy "voluntario_fotos_storage_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'voluntario-fotos'
    and public.voluntario_foto_upload_path_ok(name)
  );

create policy "voluntario_fotos_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'voluntario-fotos'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

-- Preparar subida: credenciales + path único (15 min)
create or replace function public.preparar_subida_foto_voluntario(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_mime text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_ext text;
  v_path text;
  v_token_id uuid;
  v_grupo_vol text;
begin
  if not _vol_foto_mime_ok(p_mime) then
    return jsonb_build_object('ok', false, 'error', 'Formato no soportado. Usa JPG o PNG.');
  end if;

  v_ext := _vol_foto_ext(p_mime);
  if v_ext is null then
    return jsonb_build_object('ok', false, 'error', 'Formato no soportado. Usa JPG o PNG.');
  end if;

  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select v.grupo into v_grupo_vol
  from voluntarios v
  where v.id = p_voluntario_id and v.grupo = trim(p_grupo) and v.activa is not false;

  if v_grupo_vol is null then
    return jsonb_build_object('ok', false, 'error', 'Voluntaria no encontrada');
  end if;

  delete from voluntario_foto_upload_tokens
  where voluntario_id = p_voluntario_id and used_at is null;

  v_path := trim(p_grupo) || '/' || p_voluntario_id::text || '/' || gen_random_uuid()::text || '.' || v_ext;

  insert into voluntario_foto_upload_tokens (
    voluntario_id, grupo, storage_path, mime_type, expires_at
  ) values (
    p_voluntario_id, trim(p_grupo), v_path, lower(trim(p_mime)), now() + interval '15 minutes'
  )
  returning id into v_token_id;

  return jsonb_build_object(
    'ok', true,
    'upload_token_id', v_token_id,
    'storage_path', v_path,
    'mime_type', lower(trim(p_mime)),
    'expires_at', (now() + interval '15 minutes')
  );
end;
$$;

-- Confirmar tras upload al storage (reemplaza foto anterior)
create or replace function public.confirmar_foto_voluntario(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_t record;
  v_old_path text;
  v_grupo_folder text;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select t.id, t.storage_path, t.mime_type, t.grupo
  into v_t
  from voluntario_foto_upload_tokens t
  where t.voluntario_id = p_voluntario_id
    and t.storage_path = trim(p_storage_path)
    and t.used_at is null
    and t.expires_at > now()
  limit 1;

  if v_t.id is null then
    return jsonb_build_object('ok', false, 'error', 'Subida expirada o inválida. Intenta de nuevo.');
  end if;

  if v_t.grupo <> trim(p_grupo) then
    return jsonb_build_object('ok', false, 'error', 'Ruta no válida');
  end if;

  v_grupo_folder := (storage.foldername(v_t.storage_path))[1];
  if v_grupo_folder is distinct from trim(p_grupo) then
    return jsonb_build_object('ok', false, 'error', 'Ruta no válida');
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'voluntario-fotos' and o.name = v_t.storage_path
  ) then
    return jsonb_build_object('ok', false, 'error', 'No encontramos la foto subida. Intenta otra vez.');
  end if;

  select v.foto_storage_path into v_old_path
  from voluntarios v
  where v.id = p_voluntario_id and v.grupo = trim(p_grupo);

  update voluntarios
  set
    foto_storage_path = v_t.storage_path,
    foto_mime_type = v_t.mime_type,
    foto_updated_at = now()
  where id = p_voluntario_id and grupo = trim(p_grupo);

  update voluntario_foto_upload_tokens
  set used_at = now()
  where id = v_t.id;

  if v_old_path is not null and v_old_path <> v_t.storage_path then
    delete from storage.objects
    where bucket_id = 'voluntario-fotos' and name = v_old_path;
  end if;

  return jsonb_build_object(
    'ok', true,
    'storage_path', v_t.storage_path,
    'mime_type', v_t.mime_type,
    'foto_updated_at', now()
  );
end;
$$;

-- URL de lectura: emite token corto para signed URL desde el cliente
create or replace function public.url_foto_voluntario(
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
  v_path text;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select v.foto_storage_path into v_path
  from voluntarios v
  where v.id = p_voluntario_id
    and v.grupo = trim(p_grupo)
    and v.activa is not false;

  if v_path is null or trim(v_path) = '' then
    return jsonb_build_object('ok', false, 'error', 'Sin foto', 'tiene_foto', false);
  end if;

  delete from voluntario_foto_read_tokens
  where voluntario_id = p_voluntario_id and expires_at < now();

  insert into voluntario_foto_read_tokens (voluntario_id, storage_path, expires_at)
  values (p_voluntario_id, v_path, now() + interval '5 minutes');

  return jsonb_build_object(
    'ok', true,
    'tiene_foto', true,
    'storage_path', v_path,
    'read_expires_at', now() + interval '5 minutes'
  );
end;
$$;

grant execute on function public.preparar_subida_foto_voluntario(uuid, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.confirmar_foto_voluntario(uuid, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.url_foto_voluntario(uuid, text, text, text, text)
  to anon, authenticated;

comment on function public.preparar_subida_foto_voluntario is
  'Voluntaria autenticada por credenciales ligeras: devuelve storage_path para upload (15 min).';
comment on function public.confirmar_foto_voluntario is
  'Tras storage.upload: fija foto en voluntarios y borra la anterior.';
comment on function public.url_foto_voluntario is
  'Emite ventana de lectura 5 min; luego createSignedUrl en bucket voluntario-fotos.';
