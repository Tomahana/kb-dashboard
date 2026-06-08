-- =============================================================================
-- KB Dashboard – termíny sběrů dat a odesílání na úřady
-- =============================================================================
-- Kde spustit: Supabase Dashboard → SQL Editor → New query → Run
--
-- Po spuštění modul Termíny načítá a ukládá data do tabulky kb_deadlines.
-- Import JSON z kolegů lze provést v aplikaci (Termíny → Import JSON).
-- =============================================================================

create table if not exists public.kb_deadlines (
  id uuid primary key default gen_random_uuid(),
  id_polozky text,
  oblast text,
  nazev text not null,
  popis text,
  odpovedna_osoba text,
  potrebujeme_od text,
  dodavatel_fakulta text,
  kam_vyplnit text,
  system_zdroj text,
  termin_sberu date,
  termin_interni date,
  termin_odeslani date,
  periodicita text,
  ucel text,
  navazny_proces text,
  riziko text,
  stav text not null default 'Aktivní',
  poznamka text,
  zdroj text,
  urad text,
  agenda text,
  typ text,
  kb_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kb_deadlines is 'Termíny sběrů dat a odesílání výkazů — struktura odpovídá tabulce kolegů';
comment on column public.kb_deadlines.id_polozky is 'ID položky z evidence kolegů';
comment on column public.kb_deadlines.oblast is 'Oblast';
comment on column public.kb_deadlines.nazev is 'Co se hlídá / název indikátoru';
comment on column public.kb_deadlines.popis is 'Stručný popis údaje';
comment on column public.kb_deadlines.odpovedna_osoba is 'Kdo to hlídá na rektorátu';
comment on column public.kb_deadlines.potrebujeme_od is 'Od koho potřebujeme data';
comment on column public.kb_deadlines.dodavatel_fakulta is 'Kdo dodává data za fakultu / součást';
comment on column public.kb_deadlines.kam_vyplnit is 'Kam se data vyplňují / zadávají';
comment on column public.kb_deadlines.system_zdroj is 'Primární systém nebo zdroj dat';
comment on column public.kb_deadlines.termin_sberu is 'Termín pro fakulty / součásti';
comment on column public.kb_deadlines.termin_interni is 'Interní termín pro zpracování na rektorátu';
comment on column public.kb_deadlines.termin_odeslani is 'Finální / externí termín';
comment on column public.kb_deadlines.zdroj is 'Původ záznamu, např. kolegové, vlastní, import';

-- Pokud tabulka už existuje z dřívější verze, doplňte sloupce:
-- spusťte také supabase/deadlines-migrate-v2.sql

create index if not exists kb_deadlines_termin_odeslani_idx
  on public.kb_deadlines (termin_odeslani);

create index if not exists kb_deadlines_termin_sberu_idx
  on public.kb_deadlines (termin_sberu);

create index if not exists kb_deadlines_stav_idx
  on public.kb_deadlines (stav);

create or replace function public.kb_deadlines_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_deadlines_updated_at_trg on public.kb_deadlines;
create trigger kb_deadlines_updated_at_trg
  before update on public.kb_deadlines
  for each row
  execute function public.kb_deadlines_set_updated_at();

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.kb_deadlines to anon, authenticated;

alter table public.kb_deadlines enable row level security;

drop policy if exists "kb_deadlines authenticated read" on public.kb_deadlines;
create policy "kb_deadlines authenticated read"
  on public.kb_deadlines for select
  to authenticated
  using (true);

drop policy if exists "kb_deadlines authenticated write" on public.kb_deadlines;
create policy "kb_deadlines authenticated write"
  on public.kb_deadlines for all
  to authenticated
  using (true)
  with check (true);

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'kb_deadlines';
