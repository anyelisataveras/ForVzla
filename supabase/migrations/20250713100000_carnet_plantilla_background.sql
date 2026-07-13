-- Fondo de carnet por grupo: bucket + RPCs para portal coordinadoras.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'carnet-plantillas',
  'carnet-plantillas',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "carnet_plantillas_storage_select" on storage.objects;
drop policy if exists "carnet_plantillas_storage_insert" on storage.objects;
drop policy if exists "carnet_plantillas_storage_update" on storage.objects;
drop policy if exists "carnet_plantillas_storage_delete" on storage.objects;

create policy "carnet_plantillas_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'carnet-plantillas'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "carnet_plantillas_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'carnet-plantillas'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "carnet_plantillas_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'carnet-plantillas'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'carnet-plantillas'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "carnet_plantillas_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'carnet-plantillas'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

-- Lectura plantilla para coordinadoras (preview + metadatos)
create or replace function public.plantilla_carnet_coord(p_grupo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row carnet_plantillas%rowtype;
begin
  if not (is_admin() or is_moderador_grupo(trim(p_grupo))) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select * into v_row
  from carnet_plantillas
  where grupo = trim(p_grupo);

  if v_row.grupo is null then
    return jsonb_build_object('ok', false, 'error', 'Sin plantilla para este grupo');
  end if;

  return jsonb_build_object(
    'ok', true,
    'grupo', v_row.grupo,
    'activo', v_row.activo,
    'version', v_row.version,
    'updated_at', v_row.updated_at,
    'config', v_row.config,
    'background_storage_path', v_row.config->>'background_storage_path',
    'background_mime_type', v_row.config->>'background_mime_type',
    'background_updated_at', v_row.config->>'background_updated_at',
    'dimensions', v_row.config->'dimensions'
  );
end;
$$;

-- Tras storage.upload: fija fondo en carnet_plantillas.config
create or replace function public.actualizar_fondo_carnet_grupo(
  p_grupo text,
  p_storage_path text,
  p_mime text default 'image/png'
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_path text;
  v_folder text;
  v_old text;
begin
  if not (is_admin() or is_moderador_grupo(trim(p_grupo))) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  v_path := trim(p_storage_path);
  if v_path = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta ruta del archivo');
  end if;

  v_folder := (storage.foldername(v_path))[1];
  if v_folder is distinct from trim(p_grupo) then
    return jsonb_build_object('ok', false, 'error', 'Ruta no válida para este grupo');
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'carnet-plantillas' and o.name = v_path
  ) then
    return jsonb_build_object('ok', false, 'error', 'No encontramos la imagen subida. Intenta otra vez.');
  end if;

  select config->>'background_storage_path' into v_old
  from carnet_plantillas where grupo = trim(p_grupo);

  update carnet_plantillas
  set
    config = config || jsonb_build_object(
      'background_storage_path', v_path,
      'background_mime_type', coalesce(nullif(trim(p_mime), ''), 'image/png'),
      'background_updated_at', now(),
      'template_slug', coalesce(config->>'template_slug', 'cuidadoras_caracas_v3')
    ),
    version = version + 1,
    updated_at = now()
  where grupo = trim(p_grupo);

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Sin plantilla para este grupo');
  end if;

  return jsonb_build_object(
    'ok', true,
    'storage_path', v_path,
    'old_storage_path', case when v_old is not null and v_old <> v_path then v_old else null end,
    'version', (select version from carnet_plantillas where grupo = trim(p_grupo))
  );
end;
$$;

grant execute on function public.plantilla_carnet_coord(text) to authenticated;
grant execute on function public.actualizar_fondo_carnet_grupo(text, text, text) to authenticated;

comment on function public.plantilla_carnet_coord is
  'Portal coord: lee plantilla carnet del grupo (fondo, dimensiones, versión).';
comment on function public.actualizar_fondo_carnet_grupo is
  'Portal coord: tras subir PNG/JPEG a carnet-plantillas/{grupo}/, fija background en config.';
