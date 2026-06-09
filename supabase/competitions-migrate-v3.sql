-- =============================================================================
-- Migrace modulu Interní soutěže → verze 3.x (PDF, projekty, osoby)
-- =============================================================================
-- Kde spustit: Supabase Dashboard → SQL Editor → Run
-- Kdy: pokud ukládání běhu hlásí chybějící sloupec (např. pokyn_nazev)
-- =============================================================================

-- kb_competitions – PDF pokyn a výzva
alter table public.kb_competitions add column if not exists pokyn text;
alter table public.kb_competitions add column if not exists pokyn_nazev text;
alter table public.kb_competitions add column if not exists vyvza text;
alter table public.kb_competitions add column if not exists vyvza_nazev text;

-- kb_competition_applications – projekty a hodnocení
alter table public.kb_competition_applications add column if not exists projekt_id text;
alter table public.kb_competition_applications add column if not exists katedra text;
alter table public.kb_competition_applications add column if not exists hodnoceni_komise text;
alter table public.kb_competition_applications add column if not exists resitel_id uuid;

-- kb_competition_supported
alter table public.kb_competition_supported add column if not exists projekt_id text;
alter table public.kb_competition_supported add column if not exists katedra text;
alter table public.kb_competition_supported add column if not exists resitel_id uuid;

-- FK na kb_persons (pokud tabulka existuje)
do $$ begin
  alter table public.kb_competition_applications
    drop constraint if exists kb_competition_applications_resitel_id_fkey;
  alter table public.kb_competition_applications
    add constraint kb_competition_applications_resitel_id_fkey
    foreign key (resitel_id) references public.kb_persons(id) on delete set null;
exception when undefined_table then
  raise notice 'Tabulka kb_persons zatím neexistuje – spusťte supabase/persons-schema.sql';
when others then
  raise notice 'FK kb_competition_applications.resitel_id: %', sqlerrm;
end $$;

do $$ begin
  alter table public.kb_competition_supported
    drop constraint if exists kb_competition_supported_resitel_id_fkey;
  alter table public.kb_competition_supported
    add constraint kb_competition_supported_resitel_id_fkey
    foreign key (resitel_id) references public.kb_persons(id) on delete set null;
exception when undefined_table then null;
when others then null;
end $$;

create index if not exists kb_competition_applications_projekt_idx on public.kb_competition_applications (projekt_id);
create index if not exists kb_competition_applications_resitel_idx on public.kb_competition_applications (resitel_id);

comment on column public.kb_competitions.pokyn_nazev is 'Původní název souboru pokynu (PDF)';
comment on column public.kb_competitions.vyvza_nazev is 'Původní název souboru výzvy (PDF)';

-- Obnovit cache schématu PostgREST (Supabase API)
notify pgrst, 'reload schema';

-- Kontrola sloupců kb_competitions
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'kb_competitions'
  and column_name in ('pokyn', 'pokyn_nazev', 'vyvza', 'vyvza_nazev')
order by column_name;
