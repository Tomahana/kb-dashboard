-- =============================================================================
-- Article Factory MVP — nedestruktivní doplnění schématu
-- =============================================================================
-- Spusťte po article-factory-schema.sql
-- =============================================================================

-- Checklist před lidskou revizí na projektu
alter table public.kb_article_projects
  add column if not exists revision_checklist jsonb not null default '[]'::jsonb;

comment on column public.kb_article_projects.revision_checklist is 'Human revision checklist items (JSON array)';

-- Poznámky recenzentů na verzi rukopisu
alter table public.kb_article_versions
  add column if not exists reviewer_notes jsonb not null default '[]'::jsonb;

comment on column public.kb_article_versions.reviewer_notes is 'Aggregated reviewer notes from AI roles';

-- Pipeline běhy: více běhů na projekt (odstranění unikátního měsíce)
alter table public.kb_article_pipeline_runs
  drop constraint if exists kb_article_pipeline_runs_month_unique;

create index if not exists kb_article_pipeline_runs_project_idx
  on public.kb_article_pipeline_runs (article_project_id);

create index if not exists kb_article_pipeline_runs_month_idx
  on public.kb_article_pipeline_runs (month desc);

create index if not exists kb_article_ai_role_reviews_project_idx
  on public.kb_article_ai_role_reviews (article_project_id);

create index if not exists kb_article_versions_project_idx
  on public.kb_article_versions (article_project_id);
