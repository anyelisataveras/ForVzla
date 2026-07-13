-- Supabase ya no permite DELETE directo en storage.objects desde SQL.
-- La limpieza de archivos viejos pasa al cliente (Storage API) o al worker (service role).

create table if not exists public.voluntario_foto_delete_queue (
  id uuid primary key default gen_random_uuid(),
  voluntario_id uuid not null references public.voluntarios(id) on delete cascade,
  storage_path text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create index if not exists voluntario_foto_delete_queue_path_idx
  on public.voluntario_foto_delete_queue (storage_path, expires_at);

drop policy if exists "voluntario_fotos_storage_delete_queued" on storage.objects;
create policy "voluntario_fotos_storage_delete_queued"
  on storage.objects for delete
  to anon, authenticated
  using (
    bucket_id = 'voluntario-fotos'
    and exists (
      select 1 from public.voluntario_foto_delete_queue q
      where q.storage_path = name and q.expires_at > now()
    )
  );

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
    insert into voluntario_foto_delete_queue (voluntario_id, storage_path)
    values (p_voluntario_id, v_old_path);
  end if;

  return jsonb_build_object(
    'ok', true,
    'storage_path', v_t.storage_path,
    'mime_type', v_t.mime_type,
    'foto_updated_at', now(),
    'old_storage_path', case
      when v_old_path is not null and v_old_path <> v_t.storage_path then v_old_path
      else null
    end
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

  return jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'old_storage_paths', coalesce(v_old_paths, array[]::text[])
  );
end;
$$;

comment on function public.confirmar_foto_voluntario is
  'Tras storage.upload: fija foto en voluntarios; old_storage_path se borra vía Storage API en cliente.';
