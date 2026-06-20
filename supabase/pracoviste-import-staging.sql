-- Staging tabulka pro import CSV/TSV organizační struktury UHK.
-- Supabase Table Editor → Import CSV do kb_pracoviste_import (ne do kb_pracoviste).
-- Po importu spusťte pracoviste-import-from-staging.sql

create table if not exists public.kb_pracoviste_import (
  kodorg text,
  nazev text,
  kodorg_rodic text
);

grant select, insert, update, delete, truncate on public.kb_pracoviste_import to anon, authenticated;

alter table public.kb_pracoviste_import enable row level security;

drop policy if exists "kb_pracoviste_import auth" on public.kb_pracoviste_import;
create policy "kb_pracoviste_import auth" on public.kb_pracoviste_import
  for all to authenticated using (true) with check (true);

comment on table public.kb_pracoviste_import is 'Dočasná tabulka pro import číselníku pracovišť — po importu spusťte pracoviste-import-from-staging.sql';
