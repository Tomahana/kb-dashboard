-- DEPRECATED: osoby jsou nyní globální tabulka kb_persons
-- Použijte místo toho:
--   1) supabase/persons-schema.sql
--   2) supabase/persons-migrate-from-competitions.sql (přesun ze kb_competition_persons)
--
-- Tento soubor ponechává jen sloupce u přihlášek (bez vytváření kb_competition_persons).

alter table public.kb_competition_applications add column if not exists projekt_id text;
alter table public.kb_competition_applications add column if not exists katedra text;
alter table public.kb_competition_applications add column if not exists hodnoceni_komise text;

alter table public.kb_competition_supported add column if not exists projekt_id text;
alter table public.kb_competition_supported add column if not exists katedra text;

-- resitel_id FK na kb_persons (po persons-migrate-from-competitions.sql)
do $$ begin
  alter table public.kb_competition_applications
    add column if not exists resitel_id uuid references public.kb_persons(id) on delete set null;
exception when others then null; end $$;

do $$ begin
  alter table public.kb_competition_supported
    add column if not exists resitel_id uuid references public.kb_persons(id) on delete set null;
exception when others then null; end $$;

create index if not exists kb_competition_applications_projekt_idx on public.kb_competition_applications (projekt_id);
create index if not exists kb_competition_applications_resitel_idx on public.kb_competition_applications (resitel_id);

comment on column public.kb_competition_applications.projekt_id is 'Veřejné ID projektu v rámci soutěže';
comment on column public.kb_competition_applications.hodnoceni is 'Hodnocení proděkana (krátký text)';
comment on column public.kb_competition_applications.hodnoceni_komise is 'Hodnocení komise (delší text)';
