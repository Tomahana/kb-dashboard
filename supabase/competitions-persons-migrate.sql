-- Migrace: databáze osob, ID projektů, fakulta/katedra, hodnocení komise

create table if not exists public.kb_competition_persons (
  id uuid primary key default gen_random_uuid(),
  osobni_cislo text,
  titul_pred text,
  jmeno text not null,
  prijmeni text not null,
  titul_za text,
  email text,
  telefon text,
  fakulta text,
  katedra text,
  poznamka text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_competition_persons_prijmeni_idx on public.kb_competition_persons (prijmeni, jmeno);

alter table public.kb_competition_applications add column if not exists projekt_id text;
alter table public.kb_competition_applications add column if not exists resitel_id uuid references public.kb_competition_persons(id) on delete set null;
alter table public.kb_competition_applications add column if not exists katedra text;
alter table public.kb_competition_applications add column if not exists hodnoceni_komise text;

alter table public.kb_competition_supported add column if not exists projekt_id text;
alter table public.kb_competition_supported add column if not exists resitel_id uuid references public.kb_competition_persons(id) on delete set null;
alter table public.kb_competition_supported add column if not exists katedra text;

create index if not exists kb_competition_applications_projekt_idx on public.kb_competition_applications (projekt_id);
create index if not exists kb_competition_applications_resitel_idx on public.kb_competition_applications (resitel_id);

comment on table public.kb_competition_persons is 'Evidence osob (řešitelé) pro modul Interní soutěže';
comment on column public.kb_competition_applications.projekt_id is 'Veřejné ID projektu v rámci soutěže';
comment on column public.kb_competition_applications.hodnoceni is 'Hodnocení proděkana (krátký text)';
comment on column public.kb_competition_applications.hodnoceni_komise is 'Hodnocení komise (delší text)';

create or replace function public.kb_competition_persons_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_competition_persons_updated_at_trg on public.kb_competition_persons;
create trigger kb_competition_persons_updated_at_trg
  before update on public.kb_competition_persons for each row
  execute function public.kb_competition_persons_set_updated_at();

grant select, insert, update, delete on public.kb_competition_persons to anon, authenticated;

alter table public.kb_competition_persons enable row level security;

drop policy if exists "kb_competition_persons auth" on public.kb_competition_persons;
create policy "kb_competition_persons auth" on public.kb_competition_persons for all to authenticated using (true) with check (true);
