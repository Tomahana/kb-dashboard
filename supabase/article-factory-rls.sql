-- =============================================================================
-- KB Dashboard – RLS pro Article Factory
-- =============================================================================
-- Spusťte po article-factory-schema.sql.
-- Alternativa: celý supabase/security-rls.sql (obsahuje sekci Article Factory).
-- =============================================================================

alter table if exists public.kb_article_publications enable row level security;
alter table if exists public.kb_article_topics enable row level security;
alter table if exists public.kb_article_topic_publications enable row level security;
alter table if exists public.kb_article_target_journals enable row level security;
alter table if exists public.kb_article_projects enable row level security;
alter table if exists public.kb_article_versions enable row level security;
alter table if exists public.kb_article_ai_role_reviews enable row level security;
alter table if exists public.kb_article_literature_sources enable row level security;
alter table if exists public.kb_article_pipeline_runs enable row level security;

-- kb_article_publications
drop policy if exists "kb_article_publications authenticated read" on public.kb_article_publications;
drop policy if exists "kb_article_publications authenticated write" on public.kb_article_publications;
create policy "kb_article_publications authenticated read"
  on public.kb_article_publications for select to authenticated using (true);
create policy "kb_article_publications authenticated write"
  on public.kb_article_publications for all to authenticated using (true) with check (true);
revoke all on public.kb_article_publications from anon;

-- kb_article_topics
drop policy if exists "kb_article_topics authenticated read" on public.kb_article_topics;
drop policy if exists "kb_article_topics authenticated write" on public.kb_article_topics;
create policy "kb_article_topics authenticated read"
  on public.kb_article_topics for select to authenticated using (true);
create policy "kb_article_topics authenticated write"
  on public.kb_article_topics for all to authenticated using (true) with check (true);
revoke all on public.kb_article_topics from anon;

-- kb_article_topic_publications
drop policy if exists "kb_article_topic_publications authenticated read" on public.kb_article_topic_publications;
drop policy if exists "kb_article_topic_publications authenticated write" on public.kb_article_topic_publications;
create policy "kb_article_topic_publications authenticated read"
  on public.kb_article_topic_publications for select to authenticated using (true);
create policy "kb_article_topic_publications authenticated write"
  on public.kb_article_topic_publications for all to authenticated using (true) with check (true);
revoke all on public.kb_article_topic_publications from anon;

-- kb_article_target_journals
drop policy if exists "kb_article_target_journals authenticated read" on public.kb_article_target_journals;
drop policy if exists "kb_article_target_journals authenticated write" on public.kb_article_target_journals;
create policy "kb_article_target_journals authenticated read"
  on public.kb_article_target_journals for select to authenticated using (true);
create policy "kb_article_target_journals authenticated write"
  on public.kb_article_target_journals for all to authenticated using (true) with check (true);
revoke all on public.kb_article_target_journals from anon;

-- kb_article_projects
drop policy if exists "kb_article_projects authenticated read" on public.kb_article_projects;
drop policy if exists "kb_article_projects authenticated write" on public.kb_article_projects;
create policy "kb_article_projects authenticated read"
  on public.kb_article_projects for select to authenticated using (true);
create policy "kb_article_projects authenticated write"
  on public.kb_article_projects for all to authenticated using (true) with check (true);
revoke all on public.kb_article_projects from anon;

-- kb_article_versions
drop policy if exists "kb_article_versions authenticated read" on public.kb_article_versions;
drop policy if exists "kb_article_versions authenticated write" on public.kb_article_versions;
create policy "kb_article_versions authenticated read"
  on public.kb_article_versions for select to authenticated using (true);
create policy "kb_article_versions authenticated write"
  on public.kb_article_versions for all to authenticated using (true) with check (true);
revoke all on public.kb_article_versions from anon;

-- kb_article_ai_role_reviews
drop policy if exists "kb_article_ai_role_reviews authenticated read" on public.kb_article_ai_role_reviews;
drop policy if exists "kb_article_ai_role_reviews authenticated write" on public.kb_article_ai_role_reviews;
create policy "kb_article_ai_role_reviews authenticated read"
  on public.kb_article_ai_role_reviews for select to authenticated using (true);
create policy "kb_article_ai_role_reviews authenticated write"
  on public.kb_article_ai_role_reviews for all to authenticated using (true) with check (true);
revoke all on public.kb_article_ai_role_reviews from anon;

-- kb_article_literature_sources
drop policy if exists "kb_article_literature_sources authenticated read" on public.kb_article_literature_sources;
drop policy if exists "kb_article_literature_sources authenticated write" on public.kb_article_literature_sources;
create policy "kb_article_literature_sources authenticated read"
  on public.kb_article_literature_sources for select to authenticated using (true);
create policy "kb_article_literature_sources authenticated write"
  on public.kb_article_literature_sources for all to authenticated using (true) with check (true);
revoke all on public.kb_article_literature_sources from anon;

-- kb_article_pipeline_runs
drop policy if exists "kb_article_pipeline_runs authenticated read" on public.kb_article_pipeline_runs;
drop policy if exists "kb_article_pipeline_runs authenticated write" on public.kb_article_pipeline_runs;
create policy "kb_article_pipeline_runs authenticated read"
  on public.kb_article_pipeline_runs for select to authenticated using (true);
create policy "kb_article_pipeline_runs authenticated write"
  on public.kb_article_pipeline_runs for all to authenticated using (true) with check (true);
revoke all on public.kb_article_pipeline_runs from anon;

-- Storage bucket policies (viz article-factory-storage.sql)
drop policy if exists "kb_article_attachments auth read" on storage.objects;
drop policy if exists "kb_article_attachments auth write" on storage.objects;
create policy "kb_article_attachments auth read"
  on storage.objects for select to authenticated
  using (bucket_id = 'kb-article-attachments');
create policy "kb_article_attachments auth write"
  on storage.objects for all to authenticated
  using (bucket_id = 'kb-article-attachments')
  with check (bucket_id = 'kb-article-attachments');

select tablename, policyname from pg_policies
where schemaname = 'public' and tablename like 'kb_article_%'
order by tablename;
