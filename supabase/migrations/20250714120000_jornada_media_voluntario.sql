-- Galerías de jornada visibles para voluntarias autenticadas (solo lectura).
-- Patrón read tokens + signed URL (igual que voluntario-fotos).

create table if not exists public.jornada_media_read_tokens (
  id             uuid primary key default gen_random_uuid(),
  voluntario_id  uuid not null references public.voluntarios(id) on delete cascade,
  storage_path   text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists jornada_media_read_path_idx
  on public.jornada_media_read_tokens (storage_path, expires_at desc);

create index if not exists jornada_media_read_vol_idx
  on public.jornada_media_read_tokens (voluntario_id, expires_at desc);

alter table public.jornada_media_read_tokens enable row level security;
revoke all on table public.jornada_media_read_tokens from anon, authenticated;

create or replace function public.jornada_media_read_path_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jornada_media_read_tokens t
    where t.storage_path = p_name
      and t.expires_at > now()
  );
$$;

grant execute on function public.jornada_media_read_path_ok(text) to anon, authenticated;

drop policy if exists "jornada_media_storage_select" on storage.objects;

create policy "jornada_media_storage_select"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'jornada-media'
    and (
      is_admin()
      or is_moderador_grupo((storage.foldername(name))[1])
      or public.jornada_media_read_path_ok(name)
    )
  );

-- Emite tokens de lectura (5 min) para paths de media de una jornada del grupo.
create or replace function public._emit_jornada_media_read_tokens(
  p_voluntario_id uuid,
  p_paths text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  delete from public.jornada_media_read_tokens
  where voluntario_id = p_voluntario_id
    and expires_at < now();

  foreach v_path in array coalesce(p_paths, array[]::text[])
  loop
    if v_path is null or trim(v_path) = '' then
      continue;
    end if;
    insert into public.jornada_media_read_tokens (voluntario_id, storage_path, expires_at)
    values (p_voluntario_id, trim(v_path), now() + interval '5 minutes');
  end loop;
end;
$$;

revoke all on function public._emit_jornada_media_read_tokens(uuid, text[]) from public;
grant execute on function public._emit_jornada_media_read_tokens(uuid, text[]) to authenticated;

-- Lista completa de media de una jornada (voluntaria autenticada).
create or replace function public.media_jornada_voluntario(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_jornada_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo text;
  v_paths text[];
  v_items jsonb;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select j.grupo into v_grupo
  from jornadas j
  where j.id = p_jornada_id
    and j.grupo = trim(p_grupo)
    and j.estado in ('abierta', 'llena', 'realizada');

  if v_grupo is null then
    return jsonb_build_object('ok', false, 'error', 'Jornada no encontrada');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'media_type', m.media_type,
      'mime_type', m.mime_type,
      'storage_path', m.storage_path,
      'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb)
  into v_items
  from jornada_media m
  where m.jornada_id = p_jornada_id;

  select array_agg(m.storage_path)
  into v_paths
  from jornada_media m
  where m.jornada_id = p_jornada_id;

  perform public._emit_jornada_media_read_tokens(p_voluntario_id, v_paths);

  return jsonb_build_object(
    'ok', true,
    'total', coalesce(jsonb_array_length(v_items), 0),
    'items', v_items
  );
end;
$$;

grant execute on function public.media_jornada_voluntario(uuid, text, text, text, text, uuid)
  to anon, authenticated;

-- Resumen para listado: total + hasta 3 previews por jornada.
create or replace function public.resumen_media_jornadas_voluntario(
  p_voluntario_id uuid,
  p_grupo text,
  p_plataforma text,
  p_usuario text,
  p_cedula4 text,
  p_jornada_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths text[] := array[]::text[];
  v_result jsonb;
begin
  if not _voluntario_cred_ok(p_voluntario_id, p_grupo, p_plataforma, p_usuario, p_cedula4) then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if p_jornada_ids is null or cardinality(p_jornada_ids) = 0 then
    return jsonb_build_object('ok', true, 'jornadas', '[]'::jsonb);
  end if;

  with valid as (
    select j.id
    from jornadas j
    where j.id = any(p_jornada_ids)
      and j.grupo = trim(p_grupo)
      and j.estado in ('abierta', 'llena', 'realizada')
  ),
  counts as (
    select m.jornada_id, count(*)::int as total
    from jornada_media m
    join valid v on v.id = m.jornada_id
    group by m.jornada_id
  ),
  ranked as (
    select
      m.jornada_id,
      m.id,
      m.media_type,
      m.storage_path,
      row_number() over (partition by m.jornada_id order by m.created_at desc) as rn
    from jornada_media m
    join valid v on v.id = m.jornada_id
  ),
  previews as (
    select
      jornada_id,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'media_type', media_type,
          'storage_path', storage_path
        ) order by rn
      ) as items
    from ranked
    where rn <= 3
    group by jornada_id
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'jornada_id', c.jornada_id,
            'total', c.total,
            'previews', coalesce(p.items, '[]'::jsonb)
          )
        )
        from counts c
        left join previews p on p.jornada_id = c.jornada_id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (select array_agg(distinct r.storage_path) from ranked r where r.rn <= 3),
      array[]::text[]
    )
  into v_result, v_paths;

  perform public._emit_jornada_media_read_tokens(p_voluntario_id, v_paths);

  return jsonb_build_object('ok', true, 'jornadas', v_result);
end;
$$;

grant execute on function public.resumen_media_jornadas_voluntario(uuid, text, text, text, text, uuid[])
  to anon, authenticated;

comment on function public.media_jornada_voluntario is
  'Lista media de jornada para voluntaria autenticada; emite read tokens para signed URLs.';
comment on function public.resumen_media_jornadas_voluntario is
  'Counts y hasta 3 previews por jornada para cards del dashboard voluntaria.';
