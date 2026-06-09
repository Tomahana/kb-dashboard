-- Globální databáze osob – sdílená napříč moduly (soutěže, DKRVO, PPK, …)

create table if not exists public.kb_persons (
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
  soucast text,
  poznamka text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_persons_prijmeni_idx on public.kb_persons (prijmeni, jmeno);
create index if not exists kb_persons_osobni_cislo_idx on public.kb_persons (osobni_cislo);

comment on table public.kb_persons is 'Centrální evidence osob UHK pro všechny moduly KB Dashboardu';

create or replace function public.kb_persons_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_persons_updated_at_trg on public.kb_persons;
create trigger kb_persons_updated_at_trg
  before update on public.kb_persons for each row
  execute function public.kb_persons_set_updated_at();

grant select, insert, update, delete on public.kb_persons to anon, authenticated;

alter table public.kb_persons enable row level security;

drop policy if exists "kb_persons auth" on public.kb_persons;
create policy "kb_persons auth" on public.kb_persons for all to authenticated using (true) with check (true);
