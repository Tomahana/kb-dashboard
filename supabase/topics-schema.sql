-- =============================================================================
-- KB Dashboard – trvalá témata e-mailů
-- =============================================================================
-- Kde spustit: Supabase Dashboard → SQL Editor → New query → Run
-- Projekt:     https://supabase.com/dashboard/project/xrgdfghiwjyrdckpjzdj
--
-- Po úspěšném spuštění dashboard automaticky přepne témata ze localStorage
-- na Supabase (tabulky kb_topics + kb_topic_records).
-- =============================================================================

-- 1) Tabulky
create table if not exists public.kb_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agenda text,
  description text,
  ai_summary text,
  ai_summary_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kb_topics is 'Témata znalostní báze – seskupení e-mailů a AI shrnutí';
comment on column public.kb_topics.ai_summary is 'Syntéza z AI promptu, vložená uživatelem';

create table if not exists public.kb_topic_records (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.kb_topics(id) on delete cascade,
  kb_id text not null,
  created_at timestamptz not null default now(),
  unique (topic_id, kb_id)
);

comment on table public.kb_topic_records is 'Vazba téma ↔ e-mail (KB_ID z kb_records)';

-- 2) Indexy
create index if not exists kb_topic_records_kb_id_idx
  on public.kb_topic_records (kb_id);

create index if not exists kb_topic_records_topic_id_idx
  on public.kb_topic_records (topic_id);

create index if not exists kb_topics_updated_at_idx
  on public.kb_topics (updated_at desc);

-- 3) Auto-update updated_at u témat
create or replace function public.kb_topics_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_topics_updated_at_trg on public.kb_topics;
create trigger kb_topics_updated_at_trg
  before update on public.kb_topics
  for each row
  execute function public.kb_topics_set_updated_at();

-- 4) Oprávnění pro REST API (anon / authenticated klíč v dashboardu)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.kb_topics to anon, authenticated;
grant select, insert, update, delete on public.kb_topic_records to anon, authenticated;

-- 5) Row Level Security
alter table public.kb_topics enable row level security;
alter table public.kb_topic_records enable row level security;

drop policy if exists "kb_topics anon read" on public.kb_topics;
create policy "kb_topics anon read"
  on public.kb_topics for select
  to anon, authenticated
  using (true);

drop policy if exists "kb_topics anon write" on public.kb_topics;
create policy "kb_topics anon write"
  on public.kb_topics for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "kb_topic_records anon read" on public.kb_topic_records;
create policy "kb_topic_records anon read"
  on public.kb_topic_records for select
  to anon, authenticated
  using (true);

drop policy if exists "kb_topic_records anon write" on public.kb_topic_records;
create policy "kb_topic_records anon write"
  on public.kb_topic_records for all
  to anon, authenticated
  using (true)
  with check (true);

-- 6) Ověření (mělo by vrátit 2 řádky: kb_topics, kb_topic_records)
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('kb_topics', 'kb_topic_records')
order by table_name;
