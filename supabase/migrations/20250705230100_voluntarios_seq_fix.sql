-- Sincroniza numero_voluntaria tras importación masiva.
-- El import pudo insertar números explícitos que chocan con la secuencia serial.

-- 1) Renumerar filas duplicadas (mismo grupo + mismo número): conserva la más antigua
do $$
declare
  r record;
  v_next int;
begin
  select coalesce(max(numero_voluntaria), 0) into v_next from voluntarios;

  for r in
    select id
    from (
      select id,
        row_number() over (
          partition by grupo, numero_voluntaria
          order by created_at, id
        ) as rn
      from voluntarios
    ) x
    where rn > 1
    order by id
  loop
    v_next := v_next + 1;
    update voluntarios set numero_voluntaria = v_next where id = r.id;
  end loop;
end $$;

-- 2) Alinear secuencia global al máximo actual
select setval(
  pg_get_serial_sequence('voluntarios', 'numero_voluntaria'),
  coalesce((select max(numero_voluntaria) from voluntarios), 1)
);

-- 3) Índice único por grupo (ahora sin duplicados)
create unique index if not exists voluntarios_grupo_numero_idx
  on voluntarios (grupo, numero_voluntaria);
