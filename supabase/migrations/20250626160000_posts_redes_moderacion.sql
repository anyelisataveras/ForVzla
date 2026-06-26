-- Cola de moderación: posts crudos de redes → admin aprueba → necesidad

create table if not exists app_config (
  key text primary key,
  value text not null
);
alter table app_config enable row level security;

insert into app_config (key, value) values ('admin_pin', 'vzla26')
on conflict (key) do nothing;

create table if not exists posts_redes (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('instagram','tiktok','twitter','telegram')),
  post_id text not null,
  url text,
  texto text not null default '',
  usuario text,
  ubicacion_post text,
  post_ts timestamptz,
  source_hash text not null,

  categoria text,
  tipo text,
  urgencia text,
  zona text,
  direccion text,
  descripcion text,
  cantidad text,
  telefono text,
  confianza numeric(4,3),

  lat double precision,
  lng double precision,

  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado','descartado','duplicado')),
  necesidad_id uuid references necesidades(id),
  notas_admin text,
  revisado_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists posts_redes_source_hash_uniq
  on posts_redes (source_hash);
create index if not exists posts_redes_estado_idx on posts_redes (estado);
create index if not exists posts_redes_created_idx on posts_redes (created_at desc);

alter table posts_redes enable row level security;

create policy "pub_read_posts_redes" on posts_redes for select using (true);
create policy "pub_insert_posts_redes" on posts_redes for insert with check (true);
create policy "pub_update_posts_redes" on posts_redes for update using (true);

-- ── Aprobar: crea necesidad validada ─────────────────────────
create or replace function aprobar_post_redes(p_post_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text;
  p posts_redes%rowtype;
  v_dup_id uuid;
  v_nec_id uuid;
  v_tipo text;
  v_urg text;
begin
  select value into v_pin from app_config where key = 'admin_pin';
  if coalesce(p_pin, '') <> coalesce(v_pin, '') then
    raise exception 'PIN incorrecto';
  end if;

  select * into p from posts_redes where id = p_post_id;
  if not found then raise exception 'Post no encontrado'; end if;
  if p.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'msg', 'Ya procesado: ' || p.estado);
  end if;

  v_tipo := case
    when p.categoria = 'rescate' then coalesce(nullif(p.tipo, ''), 'Rescate')
    else coalesce(nullif(p.tipo, ''), 'Otra')
  end;
  v_urg := case
    when p.urgencia in ('critica', 'urgente', 'normal') then p.urgencia
    else 'urgente'
  end;

  if p.lat is not null and p.lng is not null then
    select nc.id into v_dup_id
    from necesidades_cercanas(p.lat, p.lng, 200, v_tipo) nc
    limit 1;
    if v_dup_id is not null then
      perform confirmar_necesidad(v_dup_id);
      update posts_redes
        set estado = 'aprobado', necesidad_id = v_dup_id, revisado_at = now()
        where id = p_post_id;
      return jsonb_build_object('ok', true, 'necesidad_id', v_dup_id, 'accion', 'confirmado_existente');
    end if;
  end if;

  insert into necesidades (
    zona, direccion_exacta, lat, lng, tipo, urgencia, descripcion, cantidad,
    nombre_contacto, telefono, fuente, source_url, source_hash, validada, estado
  ) values (
    coalesce(nullif(p.zona, ''), 'Otra'),
    coalesce(nullif(p.direccion, ''), p.ubicacion_post,
      '(de ' || p.plataforma || ' @' || coalesce(p.usuario, '') || ')'),
    p.lat, p.lng, v_tipo, v_urg,
    coalesce(nullif(p.descripcion, ''), left(p.texto, 280)),
    p.cantidad,
    case when coalesce(p.usuario, '') <> '' then '@' || p.usuario else 'Reporte de redes' end,
    coalesce(nullif(p.telefono, ''), 's/d'),
    p.plataforma, p.url, p.source_hash,
    true,
    'pendiente'
  ) returning id into v_nec_id;

  update posts_redes
    set estado = 'aprobado', necesidad_id = v_nec_id, revisado_at = now()
    where id = p_post_id;

  return jsonb_build_object('ok', true, 'necesidad_id', v_nec_id, 'accion', 'insertado');
end;
$$;

create or replace function rechazar_post_redes(
  p_post_id uuid,
  p_pin text,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  select value into v_pin from app_config where key = 'admin_pin';
  if coalesce(p_pin, '') <> coalesce(v_pin, '') then
    raise exception 'PIN incorrecto';
  end if;

  update posts_redes
    set estado = 'rechazado',
        notas_admin = coalesce(p_notas, notas_admin),
        revisado_at = now()
    where id = p_post_id and estado = 'pendiente';

  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Post no encontrado o ya procesado');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function aprobar_post_redes(uuid, text) to anon, authenticated;
grant execute on function rechazar_post_redes(uuid, text, text) to anon, authenticated;

alter publication supabase_realtime add table posts_redes;
