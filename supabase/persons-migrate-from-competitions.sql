-- Migrace: kb_competition_persons → globální kb_persons
-- Spusťte po persons-schema.sql pokud už máte modul soutěží s lokální tabulkou osob.
-- U existující tabulky kb_persons ve starém formátu nejdřív spusťte persons-migrate-v2.sql.

create table if not exists public.kb_persons (
  id uuid primary key default gen_random_uuid(),
  prijmeni text not null,
  jmeno text not null,
  tituly text,
  osobni_cislo text not null,
  stav_osoby text,
  pracoviste text,
  rodne_cislo text,
  email text,
  telefon text,
  datum_narozeni date,
  obcanstvi text,
  pohlavi text,
  orcid text,
  researcher_id text,
  scopus_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.kb_persons (
  id, prijmeni, jmeno, tituly, osobni_cislo, pracoviste, email, telefon, created_at, updated_at
)
select
  id,
  prijmeni,
  jmeno,
  trim(both from concat_ws(', ', nullif(trim(coalesce(titul_pred, '')), ''), nullif(trim(coalesce(titul_za, '')), ''))),
  coalesce(nullif(trim(osobni_cislo), ''), 'AUTO-' || left(replace(id::text, '-', ''), 12)),
  trim(both from concat_ws(' · ', nullif(trim(coalesce(fakulta, '')), ''), nullif(trim(coalesce(katedra, '')), ''), nullif(trim(coalesce(soucast, '')), ''))),
  email,
  telefon,
  created_at,
  updated_at
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

comment on table public.kb_persons is 'Centrální evidence osob UHK – 15 sloupců, osobni_cislo jako klíč pro vazby';
