-- Propojení modulů s kb_persons přes osobni_cislo (obchodní klíč)
-- Spusťte po supabase/persons-schema.sql a persons-migrate-v2.sql

-- =============================================================================
-- Interní soutěže – řešitel projektu
-- =============================================================================
alter table public.kb_competition_applications
  add column if not exists resitel_osobni_cislo text;

alter table public.kb_competition_supported
  add column if not exists resitel_osobni_cislo text;

do $$ begin
  alter table public.kb_competition_applications
    add constraint kb_comp_app_resitel_osobni_cislo_fkey
    foreign key (resitel_osobni_cislo) references public.kb_persons(osobni_cislo) on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.kb_competition_supported
    add constraint kb_comp_supp_resitel_osobni_cislo_fkey
    foreign key (resitel_osobni_cislo) references public.kb_persons(osobni_cislo) on delete set null;
exception when duplicate_object then null;
end $$;

update public.kb_competition_applications a
set resitel_osobni_cislo = p.osobni_cislo
from public.kb_persons p
where a.resitel_id = p.id
  and (a.resitel_osobni_cislo is null or a.resitel_osobni_cislo = '');

update public.kb_competition_supported s
set resitel_osobni_cislo = p.osobni_cislo
from public.kb_persons p
where s.resitel_id = p.id
  and (s.resitel_osobni_cislo is null or s.resitel_osobni_cislo = '');

create index if not exists kb_comp_app_resitel_osobni_cislo_idx
  on public.kb_competition_applications (resitel_osobni_cislo);
create index if not exists kb_comp_supp_resitel_osobni_cislo_idx
  on public.kb_competition_supported (resitel_osobni_cislo);

-- =============================================================================
-- Termíny – odpovědná osoba na rektorátu
-- =============================================================================
alter table public.kb_deadlines
  add column if not exists odpovedna_osoba_osobni_cislo text;

do $$ begin
  alter table public.kb_deadlines
    add constraint kb_deadlines_odp_osoba_osobni_cislo_fkey
    foreign key (odpovedna_osoba_osobni_cislo) references public.kb_persons(osobni_cislo) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists kb_deadlines_odp_osoba_osobni_cislo_idx
  on public.kb_deadlines (odpovedna_osoba_osobni_cislo);

-- =============================================================================
-- E-maily (kb_records) – odesílatel a odpovědná osoba
-- =============================================================================
do $$ begin
  alter table public.kb_records add column if not exists odesilatel_osobni_cislo text;
  alter table public.kb_records add column if not exists odpovedna_osoba_osobni_cislo text;
exception when undefined_table then
  raise notice 'Tabulka kb_records neexistuje – sloupce pro e-maily přeskočeny';
end $$;

do $$ begin
  alter table public.kb_records
    add constraint kb_records_odesilatel_osobni_cislo_fkey
    foreign key (odesilatel_osobni_cislo) references public.kb_persons(osobni_cislo) on delete set null;
exception when undefined_table then null;
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.kb_records
    add constraint kb_records_odp_osoba_osobni_cislo_fkey
    foreign key (odpovedna_osoba_osobni_cislo) references public.kb_persons(osobni_cislo) on delete set null;
exception when undefined_table then null;
  when duplicate_object then null;
end $$;

-- Doplnění vazby e-mail → osoba podle shody e-mailu (sloupce v kb_records jsou česky: "Odesílatel")
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'kb_records'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kb_records' and column_name = 'Odesílatel'
  ) then
    execute $sql$
      update public.kb_records r
      set odesilatel_osobni_cislo = p.osobni_cislo
      from public.kb_persons p
      where lower(trim(coalesce(r."Odesílatel", ''))) = lower(trim(p.email))
        and p.email is not null and trim(p.email) <> ''
        and (r.odesilatel_osobni_cislo is null or r.odesilatel_osobni_cislo = '')
    $sql$;
    raise notice 'Doplněno odesilatel_osobni_cislo z sloupce "Odesílatel"';
  else
    raise notice 'Sloupec "Odesílatel" v kb_records nenalezen – přeskočeno';
  end if;
exception when undefined_table then
  raise notice 'Tabulka kb_records neexistuje – přeskočeno';
end $$;

-- Odpovědná osoba u e-mailu (pokud je v poli e-mailová adresa)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kb_records' and column_name = 'Odpovědná osoba'
  ) then
    execute $sql$
      update public.kb_records r
      set odpovedna_osoba_osobni_cislo = p.osobni_cislo
      from public.kb_persons p
      where lower(trim(coalesce(r."Odpovědná osoba", ''))) = lower(trim(p.email))
        and p.email is not null and trim(p.email) <> ''
        and (r.odpovedna_osoba_osobni_cislo is null or r.odpovedna_osoba_osobni_cislo = '')
    $sql$;
    raise notice 'Doplněno odpovedna_osoba_osobni_cislo z "Odpovědná osoba" (shoda e-mailu)';
  end if;
exception when undefined_table then null;
end $$;

comment on column public.kb_competition_applications.resitel_osobni_cislo is 'FK na kb_persons – obchodní klíč řešitele';
comment on column public.kb_deadlines.odpovedna_osoba_osobni_cislo is 'FK na kb_persons – kdo hlídá termín na rektorátu';

-- =============================================================================
-- Budoucí moduly (šablona – zatím nespouštět):
-- kb_vystupy (autor_osobni_cislo, resitel_osobni_cislo → kb_persons) — viz vystupy-schema.sql
-- =============================================================================

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and column_name like '%osobni_cislo%'
order by table_name, column_name;
