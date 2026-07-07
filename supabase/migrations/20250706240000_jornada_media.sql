-- Fotos y videos por jornada (registro de actividades)

create table if not exists jornada_media (
  id            uuid primary key default gen_random_uuid(),
  jornada_id    uuid not null references jornadas(id) on delete cascade,
  grupo         text not null,
  storage_path  text not null,
  mime_type     text not null,
  media_type    text not null check (media_type in ('foto', 'video')),
  caption       text,
  subido_por    text,
  created_at    timestamptz not null default now(),
  constraint jornada_media_path_unique unique (storage_path)
);

create index if not exists jornada_media_jornada_idx on jornada_media (jornada_id, created_at desc);
create index if not exists jornada_media_grupo_idx on jornada_media (grupo);

create or replace function public.set_jornada_media_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select j.grupo into new.grupo
  from jornadas j
  where j.id = new.jornada_id;

  if new.grupo is null then
    raise exception 'Jornada no encontrada';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_jornada_media_grupo on jornada_media;
create trigger trg_jornada_media_grupo
  before insert on jornada_media
  for each row execute function set_jornada_media_grupo();

alter table jornada_media enable row level security;

drop policy if exists "mod_read_jornada_media" on jornada_media;
drop policy if exists "mod_write_jornada_media" on jornada_media;

create policy "mod_read_jornada_media"
  on jornada_media for select
  using (is_admin() or is_moderador_grupo(grupo));

create policy "mod_write_jornada_media"
  on jornada_media for all
  using (is_admin() or is_moderador_grupo(grupo))
  with check (is_admin() or is_moderador_grupo(grupo));

grant select, insert, update, delete on table jornada_media to authenticated;

-- Bucket privado (URLs firmadas desde el panel)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'jornada-media',
  'jornada-media',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "jornada_media_storage_select" on storage.objects;
drop policy if exists "jornada_media_storage_insert" on storage.objects;
drop policy if exists "jornada_media_storage_delete" on storage.objects;

create policy "jornada_media_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'jornada-media'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "jornada_media_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'jornada-media'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );

create policy "jornada_media_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'jornada-media'
    and (is_admin() or is_moderador_grupo((storage.foldername(name))[1]))
  );
