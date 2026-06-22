-- Document Intelligence — tabulka pro AI analýzu dokumentů z OneDrive složky.
-- Projekt: uhk-analytics (nebo stejný Supabase projekt jako kb-dashboard).
-- Spusťte v SQL Editoru, poté ověřte RLS.

create table if not exists doc_intelligence (
  id                uuid primary key default gen_random_uuid(),
  file_name         text not null,
  file_path         text not null,
  file_url          text,
  relative_path     text,
  folder            text,
  extension         text,
  size_kb           numeric,
  file_modified_at  timestamptz,
  file_hash         text unique,
  tema              text,
  souhrn            text,
  kategorie         text,
  dulezitost        integer check (dulezitost between 1 and 5),
  klicova_slova     text[],
  akce_doporucena   text,
  stav              text default 'nový',
  poznamky          text default '',
  termin            date,
  clickup_task_id   text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table doc_intelligence enable row level security;

drop policy if exists "allow_all" on doc_intelligence;
create policy "allow_all" on doc_intelligence for all using (true);

create index if not exists idx_di_stav      on doc_intelligence(stav);
create index if not exists idx_di_kat       on doc_intelligence(kategorie);
create index if not exists idx_di_prio      on doc_intelligence(dulezitost desc);
create index if not exists idx_di_created   on doc_intelligence(created_at desc);

-- Denní souhrn z Python agenta
create table if not exists doc_intelligence_summary (
  id uuid primary key default gen_random_uuid(),
  summary_text text not null,
  doc_count integer,
  created_at timestamptz default now()
);

alter table doc_intelligence_summary enable row level security;

drop policy if exists "allow_all" on doc_intelligence_summary;
create policy "allow_all" on doc_intelligence_summary for all using (true);

create index if not exists idx_di_summary_created on doc_intelligence_summary(created_at desc);
