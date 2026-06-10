-- =============================================================================
-- KB Dashboard – výzkumné směry UHK pro spolupráci s PČR
-- =============================================================================
-- Zdroj: Google Sheets (výzkumné směry sbírané UHK pro PČR)
-- Spusťte po persons-schema.sql (FK na kb_persons).
-- =============================================================================

create table if not exists public.kb_pcr_research_topics (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  poradi integer,
  fakulta text,
  zkr_fak text,
  katedra text,
  zkr_kat text,
  oblast text not null,
  tema text not null,
  gestor text,
  email text,
  popis text,
  gestor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  sheet_id text,
  sheet_gid text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_pcr_research_topics_source_key_unique unique (source_key)
);

comment on table public.kb_pcr_research_topics is 'Výzkumné směry UHK pro spolupráci s PČR — sync z Google Sheets';
comment on column public.kb_pcr_research_topics.source_key is 'Stabilní klíč pro upsert při synchronizaci (fakulta+katedra+oblast+téma+email)';
comment on column public.kb_pcr_research_topics.gestor_osobni_cislo is 'Propojení gestora na kb_persons';

create index if not exists kb_pcr_research_topics_oblast_idx
  on public.kb_pcr_research_topics (oblast);

create index if not exists kb_pcr_research_topics_zkr_fak_idx
  on public.kb_pcr_research_topics (zkr_fak);

create index if not exists kb_pcr_research_topics_gestor_cislo_idx
  on public.kb_pcr_research_topics (gestor_osobni_cislo);

create index if not exists kb_pcr_research_topics_email_idx
  on public.kb_pcr_research_topics (lower(email));

create or replace function public.kb_pcr_research_topics_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_pcr_research_topics_updated_at_trg on public.kb_pcr_research_topics;
create trigger kb_pcr_research_topics_updated_at_trg
  before update on public.kb_pcr_research_topics
  for each row
  execute function public.kb_pcr_research_topics_set_updated_at();

grant select, insert, update, delete on public.kb_pcr_research_topics to anon, authenticated;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'kb_pcr_research_topics'
order by ordinal_position;
