-- Skupiny témat + propojení Outlook emailů
-- Spusťte v Supabase SQL Editoru po topics-schema.sql a doc-intelligence-topics-migrate.sql

create table if not exists public.kb_topic_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kb_topic_groups is 'Skupiny pro seskupení a slučování témat';

alter table public.kb_topics
  add column if not exists group_id uuid references public.kb_topic_groups(id) on delete set null;

create index if not exists kb_topics_group_id_idx on public.kb_topics (group_id);

grant select, insert, update, delete on public.kb_topic_groups to anon, authenticated;

alter table public.kb_topic_groups enable row level security;

drop policy if exists "kb_topic_groups authenticated read" on public.kb_topic_groups;
create policy "kb_topic_groups authenticated read"
  on public.kb_topic_groups for select to authenticated using (true);

drop policy if exists "kb_topic_groups authenticated write" on public.kb_topic_groups;
create policy "kb_topic_groups authenticated write"
  on public.kb_topic_groups for all to authenticated using (true) with check (true);
