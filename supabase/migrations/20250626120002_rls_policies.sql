-- RLS: acceso público de emergencia; moderación vía Table Editor

alter table necesidades enable row level security;
alter table recursos enable row level security;
alter table centros_acopio enable row level security;
alter table edificios_colapsados enable row level security;

create policy "pub_read_necesidades"   on necesidades for select using (true);
create policy "pub_insert_necesidades" on necesidades for insert with check (true);
create policy "pub_update_necesidades" on necesidades for update using (true);

create policy "pub_read_recursos"   on recursos for select using (true);
create policy "pub_insert_recursos" on recursos for insert with check (true);
create policy "pub_update_recursos" on recursos for update using (true);

create policy "pub_read_acopio"   on centros_acopio for select using (true);
create policy "pub_insert_acopio" on centros_acopio for insert with check (true);
create policy "pub_update_acopio" on centros_acopio for update using (true);

create policy "pub_read_edificios"   on edificios_colapsados for select using (true);
create policy "pub_insert_edificios" on edificios_colapsados for insert with check (true);
create policy "pub_update_edificios" on edificios_colapsados for update using (true);
