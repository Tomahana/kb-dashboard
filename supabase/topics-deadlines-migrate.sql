-- Vazba téma ↔ termín (kb_deadlines)
-- Spusťte v Supabase SQL Editoru po topics-schema.sql a deadlines-schema.sql

create table if not exists public.kb_topic_deadlines (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.kb_topics(id) on delete cascade,
  deadline_id uuid not null references public.kb_deadlines(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (topic_id, deadline_id)
);

comment on table public.kb_topic_deadlines is 'Vazba téma ↔ termín z modulu Termíny';

create index if not exists kb_topic_deadlines_topic_id_idx on public.kb_topic_deadlines (topic_id);
create index if not exists kb_topic_deadlines_deadline_id_idx on public.kb_topic_deadlines (deadline_id);

grant select, insert, update, delete on public.kb_topic_deadlines to anon, authenticated;

alter table public.kb_topic_deadlines enable row level security;

drop policy if exists "kb_topic_deadlines authenticated read" on public.kb_topic_deadlines;
create policy "kb_topic_deadlines authenticated read"
  on public.kb_topic_deadlines for select to authenticated using (true);

drop policy if exists "kb_topic_deadlines authenticated write" on public.kb_topic_deadlines;
create policy "kb_topic_deadlines authenticated write"
  on public.kb_topic_deadlines for all to authenticated using (true) with check (true);

select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'kb_topic_deadlines';
