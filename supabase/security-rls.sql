-- =============================================================================
-- KB Dashboard – zabezpečení dat (Row Level Security)
-- =============================================================================
-- Kde spustit: Supabase Dashboard → SQL Editor → Run
--
-- DŮLEŽITÉ: Spusťte AŽ PO vytvoření uživatelů v Supabase Auth (viz SECURITY.md).
-- Po spuštění anonymní klíč bez přihlášení k datům nepřistoupí.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) kb_records + kb_record_bodies (hlavní e-maily)
-- ---------------------------------------------------------------------------
alter table if exists public.kb_records enable row level security;
alter table if exists public.kb_record_bodies enable row level security;

-- Odstranit otevřené politiky (pokud existují)
drop policy if exists "kb_records anon read" on public.kb_records;
drop policy if exists "kb_records anon write" on public.kb_records;
drop policy if exists "kb_records public read" on public.kb_records;
drop policy if exists "kb_records public write" on public.kb_records;
drop policy if exists "kb_records authenticated read" on public.kb_records;
drop policy if exists "kb_records authenticated update" on public.kb_records;

drop policy if exists "kb_record_bodies anon read" on public.kb_record_bodies;
drop policy if exists "kb_record_bodies public read" on public.kb_record_bodies;
drop policy if exists "kb_record_bodies authenticated read" on public.kb_record_bodies;

-- Jen přihlášení uživatelé
create policy "kb_records authenticated read"
  on public.kb_records for select
  to authenticated
  using (true);

create policy "kb_records authenticated update"
  on public.kb_records for update
  to authenticated
  using (true)
  with check (true);

create policy "kb_record_bodies authenticated read"
  on public.kb_record_bodies for select
  to authenticated
  using (true);

revoke all on public.kb_records from anon;
revoke all on public.kb_record_bodies from anon;
grant select, update on public.kb_records to authenticated;
grant select on public.kb_record_bodies to authenticated;

-- ---------------------------------------------------------------------------
-- 2) kb_topics + kb_topic_records (témata)
-- ---------------------------------------------------------------------------
alter table if exists public.kb_topics enable row level security;
alter table if exists public.kb_topic_records enable row level security;

drop policy if exists "kb_topics anon read" on public.kb_topics;
drop policy if exists "kb_topics anon write" on public.kb_topics;
drop policy if exists "kb_topics authenticated read" on public.kb_topics;
drop policy if exists "kb_topics authenticated write" on public.kb_topics;

drop policy if exists "kb_topic_records anon read" on public.kb_topic_records;
drop policy if exists "kb_topic_records anon write" on public.kb_topic_records;
drop policy if exists "kb_topic_records authenticated read" on public.kb_topic_records;
drop policy if exists "kb_topic_records authenticated write" on public.kb_topic_records;

create policy "kb_topics authenticated read"
  on public.kb_topics for select
  to authenticated
  using (true);

create policy "kb_topics authenticated write"
  on public.kb_topics for all
  to authenticated
  using (true)
  with check (true);

create policy "kb_topic_records authenticated read"
  on public.kb_topic_records for select
  to authenticated
  using (true);

create policy "kb_topic_records authenticated write"
  on public.kb_topic_records for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.kb_topics from anon;
revoke all on public.kb_topic_records from anon;
grant select, insert, update, delete on public.kb_topics to authenticated;
grant select, insert, update, delete on public.kb_topic_records to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Ověření
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('kb_records', 'kb_record_bodies', 'kb_topics', 'kb_topic_records')
order by tablename, policyname;
