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
alter table if exists public.kb_topic_deadlines enable row level security;

drop policy if exists "kb_topics anon read" on public.kb_topics;
drop policy if exists "kb_topics anon write" on public.kb_topics;
drop policy if exists "kb_topics authenticated read" on public.kb_topics;
drop policy if exists "kb_topics authenticated write" on public.kb_topics;

drop policy if exists "kb_topic_records anon read" on public.kb_topic_records;
drop policy if exists "kb_topic_records anon write" on public.kb_topic_records;
drop policy if exists "kb_topic_records authenticated read" on public.kb_topic_records;
drop policy if exists "kb_topic_records authenticated write" on public.kb_topic_records;

drop policy if exists "kb_topic_deadlines authenticated read" on public.kb_topic_deadlines;
drop policy if exists "kb_topic_deadlines authenticated write" on public.kb_topic_deadlines;

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

create policy "kb_topic_deadlines authenticated read"
  on public.kb_topic_deadlines for select
  to authenticated
  using (true);

create policy "kb_topic_deadlines authenticated write"
  on public.kb_topic_deadlines for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.kb_topics from anon;
revoke all on public.kb_topic_records from anon;
revoke all on public.kb_topic_deadlines from anon;
grant select, insert, update, delete on public.kb_topics to authenticated;
grant select, insert, update, delete on public.kb_topic_records to authenticated;
grant select, insert, update, delete on public.kb_topic_deadlines to authenticated;

-- ---------------------------------------------------------------------------
-- 3) kb_deadlines (termíny sběrů)
-- ---------------------------------------------------------------------------
alter table if exists public.kb_deadlines enable row level security;

drop policy if exists "kb_deadlines anon read" on public.kb_deadlines;
drop policy if exists "kb_deadlines anon write" on public.kb_deadlines;
drop policy if exists "kb_deadlines authenticated read" on public.kb_deadlines;
drop policy if exists "kb_deadlines authenticated write" on public.kb_deadlines;

create policy "kb_deadlines authenticated read"
  on public.kb_deadlines for select
  to authenticated
  using (true);

create policy "kb_deadlines authenticated write"
  on public.kb_deadlines for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.kb_deadlines from anon;
grant select, insert, update, delete on public.kb_deadlines to authenticated;

-- ---------------------------------------------------------------------------
-- 4) kb_competitions + přihlášky a podpořené projekty (interní soutěže)
-- ---------------------------------------------------------------------------
alter table if exists public.kb_competitions enable row level security;
alter table if exists public.kb_persons enable row level security;
alter table if exists public.kb_competition_applications enable row level security;
alter table if exists public.kb_competition_supported enable row level security;

drop policy if exists "kb_competitions auth" on public.kb_competitions;
drop policy if exists "kb_competitions anon read" on public.kb_competitions;
drop policy if exists "kb_competitions anon write" on public.kb_competitions;
drop policy if exists "kb_competitions authenticated read" on public.kb_competitions;
drop policy if exists "kb_competitions authenticated write" on public.kb_competitions;

drop policy if exists "kb_persons auth" on public.kb_persons;
drop policy if exists "kb_persons authenticated read" on public.kb_persons;
drop policy if exists "kb_persons authenticated write" on public.kb_persons;

drop policy if exists "kb_competition_applications auth" on public.kb_competition_applications;
drop policy if exists "kb_competition_applications authenticated read" on public.kb_competition_applications;
drop policy if exists "kb_competition_applications authenticated write" on public.kb_competition_applications;

drop policy if exists "kb_competition_supported auth" on public.kb_competition_supported;
drop policy if exists "kb_competition_supported authenticated read" on public.kb_competition_supported;
drop policy if exists "kb_competition_supported authenticated write" on public.kb_competition_supported;

create policy "kb_competitions authenticated read"
  on public.kb_competitions for select
  to authenticated
  using (true);

create policy "kb_competitions authenticated write"
  on public.kb_competitions for all
  to authenticated
  using (true)
  with check (true);

create policy "kb_persons authenticated read"
  on public.kb_persons for select
  to authenticated
  using (true);

create policy "kb_persons authenticated write"
  on public.kb_persons for all
  to authenticated
  using (true)
  with check (true);

create policy "kb_competition_applications authenticated read"
  on public.kb_competition_applications for select
  to authenticated
  using (true);

create policy "kb_competition_applications authenticated write"
  on public.kb_competition_applications for all
  to authenticated
  using (true)
  with check (true);

create policy "kb_competition_supported authenticated read"
  on public.kb_competition_supported for select
  to authenticated
  using (true);

create policy "kb_competition_supported authenticated write"
  on public.kb_competition_supported for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.kb_competitions from anon;
revoke all on public.kb_persons from anon;
revoke all on public.kb_competition_applications from anon;
revoke all on public.kb_competition_supported from anon;
grant select, insert, update, delete on public.kb_competitions to authenticated;
grant select, insert, update, delete on public.kb_persons to authenticated;
grant select, insert, update, delete on public.kb_competition_applications to authenticated;
grant select, insert, update, delete on public.kb_competition_supported to authenticated;

-- ---------------------------------------------------------------------------
-- 5) kb_pcr_research_topics (výzkumné směry PČR)
-- ---------------------------------------------------------------------------
alter table if exists public.kb_pcr_research_topics enable row level security;

drop policy if exists "kb_pcr_research_topics authenticated read" on public.kb_pcr_research_topics;
drop policy if exists "kb_pcr_research_topics authenticated write" on public.kb_pcr_research_topics;

create policy "kb_pcr_research_topics authenticated read"
  on public.kb_pcr_research_topics for select
  to authenticated
  using (true);

create policy "kb_pcr_research_topics authenticated write"
  on public.kb_pcr_research_topics for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.kb_pcr_research_topics from anon;
grant select, insert, update, delete on public.kb_pcr_research_topics to authenticated;

-- ---------------------------------------------------------------------------
-- 6) kb_ai_advisor_saved (AI poradce — uložené dotazy a spojení, Fáze 2+)
-- ---------------------------------------------------------------------------
alter table if exists public.kb_ai_advisor_saved enable row level security;

drop policy if exists "kb_ai_advisor_saved authenticated read" on public.kb_ai_advisor_saved;
drop policy if exists "kb_ai_advisor_saved authenticated write" on public.kb_ai_advisor_saved;

create policy "kb_ai_advisor_saved authenticated read"
  on public.kb_ai_advisor_saved for select
  to authenticated
  using (true);

create policy "kb_ai_advisor_saved authenticated write"
  on public.kb_ai_advisor_saved for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.kb_ai_advisor_saved from anon;
grant select, insert, update, delete on public.kb_ai_advisor_saved to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Ověření
-- ---------------------------------------------------------------------------
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'kb_records', 'kb_record_bodies', 'kb_topics', 'kb_topic_records', 'kb_topic_deadlines',
    'kb_deadlines', 'kb_persons', 'kb_competitions', 'kb_competition_applications', 'kb_competition_supported',
    'kb_pcr_research_topics', 'kb_ai_advisor_saved'
  )
order by tablename, policyname;
