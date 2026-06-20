-- Globální databáze osob – sdílená napříč moduly (soutěže, DKRVO, PPK, …)
-- 15 sloupců pro interní analýzy; osobni_cislo je obchodní klíč pro napojení dalších tabulek.

create table if not exists public.kb_persons (
  id uuid primary key default gen_random_uuid(),
  prijmeni text not null,
  jmeno text not null,
  tituly text,
  osobni_cislo text not null,
  stav_osoby text,
  pracoviste text,
  kodorg text,
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

create unique index if not exists kb_persons_osobni_cislo_uniq on public.kb_persons (osobni_cislo);
create index if not exists kb_persons_prijmeni_idx on public.kb_persons (prijmeni, jmeno);

comment on table public.kb_persons is 'Centrální evidence osob UHK – 15 sloupců, osobni_cislo jako klíč pro vazby';
comment on column public.kb_persons.osobni_cislo is 'Obchodní klíč pro napojení projektů a dalších modulů';
comment on column public.kb_persons.stav_osoby is 'Stav osoby (aktivní, ukončený, …)';
comment on column public.kb_persons.pracoviste is 'Pracoviště / součást / katedra';

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
