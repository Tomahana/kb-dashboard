-- =============================================================================
-- KB Dashboard – databáze časopisů (JCR exporty)
-- =============================================================================
-- Import exportů podle roků a oborů; analýza AIS pořadí probíhá v aplikaci.
-- =============================================================================

create table if not exists public.kb_journal_records (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  journal_key text,
  journal_name text,
  jcr_abbreviation text,
  issn text,
  eissn text,
  category text not null,
  edition text,
  ais text,
  ais_quartile text,
  jif text,
  jif_year text,
  jif_quartile text,
  jif_percentile text,
  total_citations text,
  source_year text,
  source_file text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_journal_records_source_key_unique unique (source_key)
);

comment on table public.kb_journal_records is 'JCR exporty časopisů podle oborů a roků — podklad pro analýzu AIS';
comment on column public.kb_journal_records.source_key is 'Stabilní klíč pro upsert (rok+obor+časopis+edice)';
comment on column public.kb_journal_records.journal_key is 'Klíč časopisu (ISSN/eISSN/zkratka/název) pro agregaci nejlepšího výsledku';

create index if not exists kb_journal_records_category_idx
  on public.kb_journal_records (category);

create index if not exists kb_journal_records_journal_key_idx
  on public.kb_journal_records (journal_key);

create index if not exists kb_journal_records_source_year_idx
  on public.kb_journal_records (source_year);

create or replace function public.kb_journal_records_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_journal_records_updated_at_trg on public.kb_journal_records;
create trigger kb_journal_records_updated_at_trg
  before update on public.kb_journal_records
  for each row
  execute function public.kb_journal_records_set_updated_at();

grant select, insert, update, delete on public.kb_journal_records to anon, authenticated;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'kb_journal_records'
order by ordinal_position;
