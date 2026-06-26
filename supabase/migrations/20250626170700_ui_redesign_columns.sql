-- UI redesign: multiselección equipos, campo otro, necesidades del centro

alter table necesidades add column if not exists subtipos text[] default '{}';
alter table necesidades add column if not exists otro text;

update necesidades
set subtipos = array[subtipo]
where subtipo is not null
  and (subtipos is null or subtipos = '{}');

alter table centros_acopio add column if not exists necesita_ahora text[] default '{}';
alter table centros_acopio add column if not exists ya_cubierto text[] default '{}';
