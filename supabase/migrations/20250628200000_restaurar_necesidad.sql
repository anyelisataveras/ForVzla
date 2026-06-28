-- Restaurar solicitud quitada por error (solo admin)

create or replace function restaurar_necesidad(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado';
  end if;
  update necesidades
    set estado = 'pendiente'
  where id = p_id
    and merged_into is null
    and estado = 'eliminada';
  if not found then
    raise exception 'Solicitud no encontrada o no está quitada';
  end if;
end;
$$;

grant execute on function restaurar_necesidad(uuid) to authenticated;
