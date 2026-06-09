-- Migrace: kb_competition_persons → globální kb_persons
-- Spusťte po persons-schema.sql pokud už máte modul soutěží s lokální tabulkou osob

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

insert into public.kb_persons (
  id, osobni_cislo, titul_pred, jmeno, prijmeni, titul_za,
  email, telefon, fakulta, katedra, poznamka, created_at, updated_at
)
select
  id, osobni_cislo, titul_pred, jmeno, prijmeni, titul_za,
  email, telefon, fakulta, katedra, poznamka, created_at, updated_at
from public.kb_competition_persons
on conflict (id) do nothing;

alter table public.kb_competition_applications drop constraint if exists kb_competition_applications_resitel_id_fkey;
alter table public.kb_competition_supported drop constraint if exists kb_competition_supported_resitel_id_fkey;

alter table public.kb_competition_applications
  add constraint kb_competition_applications_resitel_id_fkey
  foreign key (resitel_id) references public.kb_persons(id) on delete set null;

alter table public.kb_competition_supported
  add constraint kb_competition_supported_resitel_id_fkey
  foreign key (resitel_id) references public.kb_persons(id) on delete set null;

comment on table public.kb_persons is 'Centrální evidence osob UHK pro všechny moduly KB Dashboardu';
