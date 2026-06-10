-- =============================================================================
-- KB Dashboard – RLS jen pro kb_pcr_research_topics
-- =============================================================================
-- Spusťte pokud hlavní security-rls.sql selhal dříve, nebo chcete doplnit jen PČR modul.
-- Předpoklad: tabulka existuje (supabase/pcr-research-schema.sql).
-- =============================================================================

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

select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'kb_pcr_research_topics';
