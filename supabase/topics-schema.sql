-- Spusťte v Supabase SQL Editoru pro trvalá témata e-mailů.
-- Po vytvoření tabulek dashboard automaticky načítá a ukládá témata ze Supabase.

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

create table if not exists public.kb_topic_records (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.kb_topics(id) on delete cascade,
  kb_id text not null,
  created_at timestamptz not null default now(),
  unique (topic_id, kb_id)
);

create index if not exists kb_topic_records_kb_id_idx on public.kb_topic_records (kb_id);
create index if not exists kb_topic_records_topic_id_idx on public.kb_topic_records (topic_id);

alter table public.kb_topics enable row level security;
alter table public.kb_topic_records enable row level security;

create policy "kb_topics anon read"
  on public.kb_topics for select
  to anon, authenticated
  using (true);

create policy "kb_topics anon write"
  on public.kb_topics for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "kb_topic_records anon read"
  on public.kb_topic_records for select
  to anon, authenticated
  using (true);

create policy "kb_topic_records anon write"
  on public.kb_topic_records for all
  to anon, authenticated
  using (true)
  with check (true);
