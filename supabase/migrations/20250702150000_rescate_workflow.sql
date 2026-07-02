-- Vista de rescatistas: flujo de estado propio del jefe de rescate.
-- Independiente del `estado` del voluntariado público, para no interferir.
-- Acceso por link directo, sin login → la RPC se otorga a anon (decisión de producto:
-- "en esto no hay seguridad", el valor es que el equipo pueda accionar ya).

-- ── Columnas de flujo de rescate ──
alter table necesidades
  add column if not exists rescate_estado text not null default 'nuevo',
  add column if not exists rescate_notas text,
  add column if not exists rescate_actualizado_at timestamptz;

alter table necesidades drop constraint if exists necesidades_rescate_estado_check;
alter table necesidades add constraint necesidades_rescate_estado_check
  check (rescate_estado in ('nuevo', 'verificando', 'confirmada', 'atendida', 'falsa'));

create index if not exists idx_necesidades_rescate_estado on necesidades(rescate_estado);

-- ── RPC: el jefe de rescate mueve el estado desde el link directo ──
-- nuevo        → aún no revisado
-- verificando  → mandó un motorizado/brigada a validar en sitio
-- confirmada   → la brigada confirmó que es real (marca validada=true)
-- atendida     → rescatada/resuelta (sale del mapa público: estado=cubierta)
-- falsa        → reporte falso (sale del mapa público: estado=eliminada)
create or replace function actualizar_rescate_estado(
  p_id uuid,
  p_estado text,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_estado not in ('nuevo', 'verificando', 'confirmada', 'atendida', 'falsa') then
    raise exception 'Estado de rescate inválido: %', p_estado;
  end if;

  update necesidades
     set rescate_estado = p_estado,
         rescate_notas = coalesce(nullif(trim(coalesce(p_notas, '')), ''), rescate_notas),
         rescate_actualizado_at = now(),
         validada = case when p_estado in ('confirmada', 'atendida') then true else validada end,
         estado = case
                    when p_estado = 'atendida' then 'cubierta'
                    when p_estado = 'falsa' then 'eliminada'
                    else estado
                  end
   where id = p_id
     and merged_into is null;

  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
end;
$$;

grant execute on function actualizar_rescate_estado(uuid, text, text) to anon, authenticated;
