-- Staging tabulka pro import CSV z evidence UHK (všechny sloupce jako text).
-- Supabase Table Editor → Import CSV do kb_persons_import (ne do kb_persons).
-- Po importu spusťte persons-import-from-staging.sql

create table if not exists public.kb_persons_import (
  prijmeni text,
  jmeno text,
  tituly text,
  osobni_cislo text,
  stav_osoby text,
  pracoviste text,
  rodne_cislo text,
  email text,
  telefon text,
  datum_narozeni text,
  obcanstvi text,
  pohlavi text,
  orcid text,
  researcher_id text,
  scopus_id text
);

grant select, insert, update, delete, truncate on public.kb_persons_import to anon, authenticated;

alter table public.kb_persons_import enable row level security;

drop policy if exists "kb_persons_import auth" on public.kb_persons_import;
create policy "kb_persons_import auth" on public.kb_persons_import for all to authenticated using (true) with check (true);

comment on table public.kb_persons_import is 'Dočasná tabulka pro CSV import osob – po importu spusťte persons-import-from-staging.sql';
