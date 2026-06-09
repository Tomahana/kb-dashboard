-- Modul Interní soutěže – programy, běhy, přihlášky a podpořené projekty

create table if not exists public.kb_competitions (
  id uuid primary key default gen_random_uuid(),
  program_slug text not null,
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

-- Vyžaduje tabulku kb_persons (spusťte nejdříve supabase/persons-schema.sql)

create table if not exists public.kb_competition_applications (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competitions(id) on delete cascade,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
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

create table if not exists public.kb_competition_supported (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.kb_competitions(id) on delete cascade,
  application_id uuid references public.kb_competition_applications(id) on delete set null,
  projekt_id text,
  nazev_projektu text not null,
  resitel_id uuid references public.kb_persons(id) on delete set null,
  resitel text,
  fakulta text,
  katedra text,
  castka_podpory numeric(14, 2) default 0,
  poznamka text,
  created_at timestamptz not null default now()
);

comment on column public.kb_competitions.pokyn is 'Cesta k PDF v Supabase Storage (kb-competition-docs) nebo data URL v localStorage';
comment on column public.kb_competitions.pokyn_nazev is 'Původní název souboru pokynu (PDF)';
comment on column public.kb_competitions.vyvza is 'Cesta k PDF v Supabase Storage nebo data URL v localStorage';
comment on column public.kb_competitions.vyvza_nazev is 'Původní název souboru výzvy (PDF)';

create index if not exists kb_competitions_program_idx on public.kb_competitions (program_slug);
create index if not exists kb_competition_applications_projekt_idx on public.kb_competition_applications (projekt_id);
create index if not exists kb_competition_applications_resitel_idx on public.kb_competition_applications (resitel_id);
create index if not exists kb_competition_applications_comp_idx on public.kb_competition_applications (competition_id);
create index if not exists kb_competition_supported_comp_idx on public.kb_competition_supported (competition_id);

create or replace function public.kb_competitions_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_competitions_updated_at_trg on public.kb_competitions;
create trigger kb_competitions_updated_at_trg
  before update on public.kb_competitions for each row
  execute function public.kb_competitions_set_updated_at();

grant select, insert, update, delete on public.kb_competitions to anon, authenticated;
grant select, insert, update, delete on public.kb_competition_applications to anon, authenticated;
grant select, insert, update, delete on public.kb_competition_supported to anon, authenticated;

alter table public.kb_competitions enable row level security;
alter table public.kb_competition_applications enable row level security;
alter table public.kb_competition_supported enable row level security;

drop policy if exists "kb_competitions auth" on public.kb_competitions;
create policy "kb_competitions auth" on public.kb_competitions for all to authenticated using (true) with check (true);

drop policy if exists "kb_competition_applications auth" on public.kb_competition_applications;
create policy "kb_competition_applications auth" on public.kb_competition_applications for all to authenticated using (true) with check (true);

drop policy if exists "kb_competition_supported auth" on public.kb_competition_supported;
create policy "kb_competition_supported auth" on public.kb_competition_supported for all to authenticated using (true) with check (true);
