-- Campos para importar centros desde directorios externos (idempotente)

alter table centros_acopio add column if not exists pais text not null default 'Venezuela';
alter table centros_acopio add column if not exists ciudad text;
alter table centros_acopio add column if not exists fuente text;
alter table centros_acopio add column if not exists source_hash text;
alter table centros_acopio add column if not exists source_url text;
alter table centros_acopio add column if not exists contacto_extra text;
alter table centros_acopio add column if not exists whatsapp text;
alter table centros_acopio add column if not exists reciben_texto text;
alter table centros_acopio add column if not exists ubicacion_aproximada boolean not null default false;

update centros_acopio set pais = 'Venezuela' where pais is null or trim(pais) = '';

create unique index if not exists centros_acopio_source_hash_uniq
  on centros_acopio (source_hash)
  where source_hash is not null;

create index if not exists centros_acopio_pais_idx on centros_acopio (pais);
create index if not exists centros_acopio_fuente_idx on centros_acopio (fuente);
