-- Interní soutěže – samostatné tabulky pro Connect, Prestige, ReGa a Horizon No-Cost
-- Spusťte po supabase/persons-schema.sql a supabase/competitions-storage.sql
-- Migrace dat z kb_competitions: supabase/competitions-migrate-split-programs.sql

-- ---------------------------------------------------------------------------
-- Společná funkce pro updated_at
-- ---------------------------------------------------------------------------
create or replace function public.kb_competition_runs_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ---------------------------------------------------------------------------
-- UHK Connect
-- ---------------------------------------------------------------------------
create table if not exists public.kb_competition_connect (
  id uuid primary key default gen_random_uuid(),
  nazev text not null,
  rok integer,
  beh_cislo integer default 1,
  alokovana_castka numeric(14, 2) default 0,
  pokyn text,
  pokyn_nazev text,
  vyvza text,
  vyvza_nazev text,
  pocet_prihlasek integer default 0,
  hodnoceni_prodekanu text,
  rozhodnuti_prorektorky text,
  poznamka text,
  stav text not null default 'Aktivní',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_competition_connect_applications (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_connect(id) on delete cascade,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  financni_pozadavek numeric(14, 2) default 0,
  castka_alokovana numeric(14, 2),
  hodnoceni text,
  hodnoceni_komise text,
  stav text default 'Přihláška',
  poznamka text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_competition_connect_supported (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_connect(id) on delete cascade,
  application_id uuid references public.kb_competition_connect_applications(id) on delete set null,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  castka_podpory numeric(14, 2) default 0,
  poznamka text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- UHK Prestige
-- ---------------------------------------------------------------------------
create table if not exists public.kb_competition_prestige (
  id uuid primary key default gen_random_uuid(),
  nazev text not null,
  rok integer,
  beh_cislo integer default 1,
  alokovana_castka numeric(14, 2) default 0,
  pokyn text,
  pokyn_nazev text,
  vyvza text,
  vyvza_nazev text,
  pocet_prihlasek integer default 0,
  hodnoceni_prodekanu text,
  rozhodnuti_prorektorky text,
  poznamka text,
  stav text not null default 'Aktivní',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_competition_prestige_applications (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_prestige(id) on delete cascade,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  financni_pozadavek numeric(14, 2) default 0,
  hodnoceni text,
  hodnoceni_komise text,
  stav text default 'Přihláška',
  poznamka text,
  cilova_soutez text,
  termin_podani text,
  rozpocet_rok_2 numeric(14, 2),
  hodnoceni_prumer numeric(10, 4),
  rozhodnuti_poradi integer,
  hodnoceni_kriteria jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_competition_prestige_supported (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_prestige(id) on delete cascade,
  application_id uuid references public.kb_competition_prestige_applications(id) on delete set null,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  castka_podpory numeric(14, 2) default 0,
  poznamka text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- UHK Rega
-- ---------------------------------------------------------------------------
create table if not exists public.kb_competition_rega (
  id uuid primary key default gen_random_uuid(),
  nazev text not null,
  rok integer,
  beh_cislo integer default 1,
  alokovana_castka numeric(14, 2) default 0,
  pokyn text,
  pokyn_nazev text,
  vyvza text,
  vyvza_nazev text,
  pocet_prihlasek integer default 0,
  hodnoceni_prodekanu text,
  rozhodnuti_prorektorky text,
  poznamka text,
  stav text not null default 'Aktivní',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_competition_rega_applications (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_rega(id) on delete cascade,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  financni_pozadavek numeric(14, 2) default 0,
  hodnoceni text,
  hodnoceni_komise text,
  stav text default 'Přihláška',
  poznamka text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_competition_rega_supported (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_rega(id) on delete cascade,
  application_id uuid references public.kb_competition_rega_applications(id) on delete set null,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  castka_podpory numeric(14, 2) default 0,
  poznamka text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- UHK Horizon No-Cost Entry
-- ---------------------------------------------------------------------------
create table if not exists public.kb_competition_horizon (
  id uuid primary key default gen_random_uuid(),
  nazev text not null,
  rok integer,
  beh_cislo integer default 1,
  alokovana_castka numeric(14, 2) default 0,
  pokyn text,
  pokyn_nazev text,
  vyvza text,
  vyvza_nazev text,
  pocet_prihlasek integer default 0,
  hodnoceni_prodekanu text,
  rozhodnuti_prorektorky text,
  poznamka text,
  stav text not null default 'Aktivní',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_competition_horizon_applications (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_horizon(id) on delete cascade,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  financni_pozadavek numeric(14, 2) default 0,
  hodnoceni text,
  hodnoceni_komise text,
  stav text default 'Přihláška',
  poznamka text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_competition_horizon_supported (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competition_horizon(id) on delete cascade,
  application_id uuid references public.kb_competition_horizon_applications(id) on delete set null,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  castka_podpory numeric(14, 2) default 0,
  poznamka text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexy
-- ---------------------------------------------------------------------------
create index if not exists kb_competition_connect_rok_idx on public.kb_competition_connect (rok);
create index if not exists kb_competition_connect_apps_comp_idx on public.kb_competition_connect_applications (competition_id);
create index if not exists kb_competition_connect_supp_comp_idx on public.kb_competition_connect_supported (competition_id);

create index if not exists kb_competition_prestige_rok_idx on public.kb_competition_prestige (rok);
create index if not exists kb_competition_prestige_apps_comp_idx on public.kb_competition_prestige_applications (competition_id);
create index if not exists kb_competition_prestige_supp_comp_idx on public.kb_competition_prestige_supported (competition_id);

create index if not exists kb_competition_rega_rok_idx on public.kb_competition_rega (rok);
create index if not exists kb_competition_rega_apps_comp_idx on public.kb_competition_rega_applications (competition_id);
create index if not exists kb_competition_rega_supp_comp_idx on public.kb_competition_rega_supported (competition_id);

create index if not exists kb_competition_horizon_rok_idx on public.kb_competition_horizon (rok);
create index if not exists kb_competition_horizon_apps_comp_idx on public.kb_competition_horizon_applications (competition_id);
create index if not exists kb_competition_horizon_supp_comp_idx on public.kb_competition_horizon_supported (competition_id);

-- ---------------------------------------------------------------------------
-- Triggery updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists kb_competition_connect_updated_at_trg on public.kb_competition_connect;
create trigger kb_competition_connect_updated_at_trg
  before update on public.kb_competition_connect for each row
  execute function public.kb_competition_runs_set_updated_at();

drop trigger if exists kb_competition_prestige_updated_at_trg on public.kb_competition_prestige;
create trigger kb_competition_prestige_updated_at_trg
  before update on public.kb_competition_prestige for each row
  execute function public.kb_competition_runs_set_updated_at();

drop trigger if exists kb_competition_rega_updated_at_trg on public.kb_competition_rega;
create trigger kb_competition_rega_updated_at_trg
  before update on public.kb_competition_rega for each row
  execute function public.kb_competition_runs_set_updated_at();

drop trigger if exists kb_competition_horizon_updated_at_trg on public.kb_competition_horizon;
create trigger kb_competition_horizon_updated_at_trg
  before update on public.kb_competition_horizon for each row
  execute function public.kb_competition_runs_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (authenticated)
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'kb_competition_connect', 'kb_competition_connect_applications', 'kb_competition_connect_supported',
    'kb_competition_prestige', 'kb_competition_prestige_applications', 'kb_competition_prestige_supported',
    'kb_competition_rega', 'kb_competition_rega_applications', 'kb_competition_rega_supported',
    'kb_competition_horizon', 'kb_competition_horizon_applications', 'kb_competition_horizon_supported'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "%s authenticated read" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s authenticated write" on public.%I', tbl, tbl);
    execute format(
      'create policy "%s authenticated read" on public.%I for select to authenticated using (true)',
      tbl, tbl
    );
    execute format(
      'create policy "%s authenticated write" on public.%I for all to authenticated using (true) with check (true)',
      tbl, tbl
    );
    execute format('revoke all on public.%I from anon', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end $$;

comment on table public.kb_competition_connect is 'UHK Connect – běhy / výzvy';
comment on table public.kb_competition_prestige is 'UHK Prestige – běhy / výzvy';
comment on table public.kb_competition_rega is 'UHK Rega – běhy / výzvy';
comment on table public.kb_competition_horizon is 'UHK Horizon No-Cost Entry – běhy / výzvy';

notify pgrst, 'reload schema';
