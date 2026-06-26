-- Ampliar fuentes del scraper: Twitter/X y Telegram
alter table necesidades drop constraint if exists necesidades_fuente_check;

alter table necesidades
  add constraint necesidades_fuente_check
  check (fuente in ('ciudadano','instagram','tiktok','twitter','telegram','coordinador'));
