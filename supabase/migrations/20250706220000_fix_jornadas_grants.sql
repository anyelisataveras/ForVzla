-- Fix: panel coord no ve jornadas/sitios (faltaban GRANT + lectura fiable)

grant select on table sitios to anon, authenticated;
grant select, insert, update, delete on table jornadas to authenticated;

-- Listado coord (security definer — no depende del embed PostgREST)
create or replace function public.listar_jornadas_coord(p_grupo text)
returns table (
  id uuid,
  grupo text,
  titulo text,
  sitio_id uuid,
  sitio_nombre text,
  sitio_zona text,
  fecha date,
  hora_salida time,
  hora_encuentro time,
  punto_encuentro text,
  hora_regreso_aprox time,
  descripcion text,
  brigadas text[],
  vestimenta text,
  llevar text,
  meta_voluntarias int,
  meta_vehiculos int,
  estado text,
  notas_internas text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id, j.grupo, j.titulo, j.sitio_id,
    s.nombre as sitio_nombre,
    s.zona as sitio_zona,
    j.fecha, j.hora_salida, j.hora_encuentro, j.punto_encuentro,
    j.hora_regreso_aprox, j.descripcion, j.brigadas, j.vestimenta, j.llevar,
    j.meta_voluntarias, j.meta_vehiculos, j.estado, j.notas_internas, j.created_at
  from jornadas j
  left join sitios s on s.id = j.sitio_id
  where j.grupo = trim(p_grupo)
    and (is_admin() or is_coordinador_grupo(p_grupo))
  order by j.fecha desc;
$$;

grant execute on function public.listar_jornadas_coord(text) to authenticated;
