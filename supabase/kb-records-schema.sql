-- =============================================================================
-- KB Dashboard – hlavní znalostní báze (e-maily / podklady)
-- =============================================================================
-- Původní zdroj: Microsoft Lists (sloupce se zachovávají pro kompatibilitu).
-- Spusťte jako první krok migrace z Listu do Supabase, poté:
--   kb-capture-schema.sql, notion-link-migrate.sql, persons-links-migrate.sql
--   security-rls.sql
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.kb_records (
  "KB_ID" uuid primary key,
  "Title" text,
  "Datum e-mailu" timestamptz,
  "Datum přidání" timestamptz,
  "Odesílatel" text,
  "Agenda" text[],
  "Typ záznamu" text,
  "Kam patří" text,
  "Priorita" text,
  "Stav" text,
  "Shrnutí" text,
  "Navržený bod jednání" text,
  "Úkol / další krok" text,
  "Termín" text,
  "Odpovědná osoba" text,
  "Odkaz na e-mail" text,
  "Poznámka" text,
  "KB_SYNC" timestamptz
);

comment on table public.kb_records is 'Metadata e-mailů a podkladů — dříve Microsoft List „Výzkum / KB“';

create table if not exists public.kb_record_bodies (
  "KB_ID" uuid primary key references public.kb_records ("KB_ID") on delete cascade,
  body_text text
);

comment on table public.kb_record_bodies is 'Plný text e-mailu / podkladu (odděleně kvůli velikosti)';

create index if not exists kb_records_datum_pridani_idx
  on public.kb_records ("Datum přidání" desc nulls last);

create index if not exists kb_records_stav_idx
  on public.kb_records ("Stav");

create index if not exists kb_records_agenda_gin_idx
  on public.kb_records using gin ("Agenda");

grant select, insert, update, delete on public.kb_records to anon, authenticated;
grant select, insert, update, delete on public.kb_record_bodies to anon, authenticated;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('kb_records', 'kb_record_bodies')
order by table_name, ordinal_position;
