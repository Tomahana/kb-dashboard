-- =============================================================================
-- KB Dashboard – Article Factory (Publikace / příprava článků)
-- =============================================================================
-- Spusťte po persons-schema.sql (FK autor → kb_persons).
-- Poté: article-factory-storage.sql, security-rls.sql nebo article-factory-rls.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Publikace (vlastní evidence + volitelný odkaz na kb_vystupy_*)
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_publications (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  title text not null,
  authors text,
  authors_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  year integer check (year is null or (year >= 1990 and year <= 2100)),
  journal_or_publisher text,
  doi text,
  issn text,
  wos_category text,
  abstract text,
  keywords text,
  methodology text,
  main_findings text,
  file_url text,
  vystup_id uuid,
  vystup_type text check (vystup_type is null or vystup_type in ('Jimp', 'JSC')),
  notes text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_article_publications_source_key_unique unique (source_key)
);

comment on table public.kb_article_publications is 'Article Factory — evidence vlastních publikací (sync z Výstupů volitelný)';
comment on column public.kb_article_publications.vystup_id is 'Volitelný odkaz na kb_vystupy_jimp / kb_vystupy_jsc (bez FK kvůli více tabulkám)';
comment on column public.kb_article_publications.file_url is 'Cesta v bucketu kb-article-attachments';

create index if not exists kb_article_publications_doi_idx on public.kb_article_publications (lower(doi));
create index if not exists kb_article_publications_year_idx on public.kb_article_publications (year);

-- ---------------------------------------------------------------------------
-- Témata článků
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_topics (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  title text not null,
  description text,
  research_area text,
  possible_methodology text,
  target_wos_category text,
  expected_contribution text,
  priority integer not null default 3 check (priority >= 1 and priority <= 5),
  status text not null default 'idea' check (status in (
    'idea', 'selected', 'in_progress', 'drafted', 'reviewed', 'submitted', 'rejected', 'published'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_article_topics_source_key_unique unique (source_key)
);

comment on table public.kb_article_topics is 'Article Factory — backlog témat na nové články';

create index if not exists kb_article_topics_status_idx on public.kb_article_topics (status);
create index if not exists kb_article_topics_priority_idx on public.kb_article_topics (priority desc);

-- ---------------------------------------------------------------------------
-- M:N témata ↔ publikace
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_topic_publications (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.kb_article_topics(id) on delete cascade,
  publication_id uuid not null references public.kb_article_publications(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint kb_article_topic_publications_unique unique (topic_id, publication_id)
);

-- ---------------------------------------------------------------------------
-- Cílové časopisy
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_target_journals (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  journal_title text not null,
  publisher text,
  issn text,
  eissn text,
  wos_category text,
  quartile text check (quartile is null or quartile in ('Q1', 'Q2', 'Q3', 'Q4')),
  ais_rank_info text,
  scope text,
  article_types text[] default '{}',
  open_access_info text,
  publication_fee numeric(12, 2),
  submission_url text,
  author_guidelines_url text,
  notes text,
  last_verified_at timestamptz,
  journal_record_id uuid references public.kb_journal_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_article_target_journals_source_key_unique unique (source_key)
);

comment on table public.kb_article_target_journals is 'Article Factory — kurátorovaný seznam cílových časopisů (Q1…)';

create index if not exists kb_article_target_journals_issn_idx on public.kb_article_target_journals (issn);
create index if not exists kb_article_target_journals_quartile_idx on public.kb_article_target_journals (quartile);

-- ---------------------------------------------------------------------------
-- Projekty článků
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_projects (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.kb_article_topics(id) on delete set null,
  working_title text,
  target_journal_id uuid references public.kb_article_target_journals(id) on delete set null,
  target_wos_category text,
  article_type text,
  research_question text,
  hypothesis_or_objective text,
  methodology text,
  expected_contribution text,
  status text not null default 'planning' check (status in (
    'planning', 'literature', 'drafting', 'reviewing', 'human_revision',
    'ready_for_submission', 'submitted', 'archived'
  )),
  current_version_id uuid,
  human_owner text,
  human_owner_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  deadline_internal date,
  deadline_submission date,
  is_ai_assisted boolean not null default true,
  human_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kb_article_projects is 'Article Factory — konkrétní připravované články';

-- ---------------------------------------------------------------------------
-- Verze rukopisů
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_project_id uuid not null references public.kb_article_projects(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  title text,
  abstract text,
  keywords text,
  introduction text,
  literature_review text,
  methodology text,
  results_or_expected_results text,
  discussion text,
  conclusion text,
  limitations text,
  "references" jsonb not null default '[]'::jsonb,
  full_text_markdown text,
  factual_basis jsonb not null default '{"verified_facts":[],"interpretations":[],"hypotheses":[],"proposals":[],"unverified":[]}'::jsonb,
  human_work_needed jsonb not null default '[]'::jsonb,
  created_by_role text not null default 'human',
  model_used text,
  is_draft boolean not null default true,
  created_at timestamptz not null default now(),
  constraint kb_article_versions_project_version_unique unique (article_project_id, version_number)
);

comment on column public.kb_article_versions.factual_basis is 'Povinný rozklad: verified_facts, interpretations, hypotheses, proposals, unverified';
comment on column public.kb_article_versions."references" is 'Bibliografické položky (JSON pole) — sloupec v uvozovkách kvůli rezervovanému slovu';
comment on column public.kb_article_versions.is_draft is 'AI verze vždy draft; finální až po human_reviewed_at na projektu';

-- FK current_version_id (po vytvoření tabulky verzí)
alter table public.kb_article_projects drop constraint if exists kb_article_projects_current_version_fk;
alter table public.kb_article_projects
  add constraint kb_article_projects_current_version_fk
  foreign key (current_version_id) references public.kb_article_versions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- AI role reviews
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_ai_role_reviews (
  id uuid primary key default gen_random_uuid(),
  article_project_id uuid not null references public.kb_article_projects(id) on delete cascade,
  article_version_id uuid references public.kb_article_versions(id) on delete set null,
  ai_role text not null check (ai_role in (
    'research_strategist', 'literature_scout', 'methodology_designer', 'manuscript_writer',
    'critical_reviewer', 'journal_fit_reviewer', 'integrity_reviewer', 'final_revision_assistant'
  )),
  model_used text,
  review_type text,
  strengths text,
  weaknesses text,
  factual_risks text,
  methodological_risks text,
  literature_gaps text,
  journal_fit_assessment text,
  recommendations jsonb default '[]'::jsonb,
  raw_output jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Literární zdroje
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_literature_sources (
  id uuid primary key default gen_random_uuid(),
  article_project_id uuid not null references public.kb_article_projects(id) on delete cascade,
  citation text,
  doi text,
  url text,
  source_type text not null default 'ai_suggested_unverified' check (source_type in (
    'verified_db', 'user_provided', 'ai_suggested_unverified'
  )),
  relevance_note text,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by text,
  used_in_section text[] default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Měsíční pipeline běhy
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  selected_topic_id uuid references public.kb_article_topics(id) on delete set null,
  article_project_id uuid references public.kb_article_projects(id) on delete set null,
  status text not null default 'planned' check (status in (
    'planned', 'running', 'paused', 'completed', 'failed'
  )),
  current_step text,
  summary text,
  run_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint kb_article_pipeline_runs_month_unique unique (month)
);

comment on column public.kb_article_pipeline_runs.month is 'První den kalendářního měsíce (YYYY-MM-01)';

-- ---------------------------------------------------------------------------
-- Neměnný audit lidských schválení mezi etapami
-- ---------------------------------------------------------------------------
create table if not exists public.kb_article_approvals (
  id uuid primary key default gen_random_uuid(),
  article_project_id uuid not null references public.kb_article_projects(id) on delete cascade,
  checkpoint text not null check (checkpoint in (
    'topic_selection', 'research_design', 'evidence_plan', 'final_manuscript'
  )),
  decision text not null default 'approved' check (decision in (
    'approved', 'returned', 'rejected'
  )),
  note text,
  decided_by uuid not null default auth.uid(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kb_article_approvals_project_idx
  on public.kb_article_approvals (article_project_id, created_at desc);

comment on table public.kb_article_approvals is
  'Audit lidských rozhodnutí; schválení nikdy neznamená odeslání rukopisu.';

-- ---------------------------------------------------------------------------
-- updated_at triggery
-- ---------------------------------------------------------------------------
create or replace function public.kb_article_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_article_publications_updated_at_trg on public.kb_article_publications;
create trigger kb_article_publications_updated_at_trg
  before update on public.kb_article_publications
  for each row execute function public.kb_article_set_updated_at();

drop trigger if exists kb_article_topics_updated_at_trg on public.kb_article_topics;
create trigger kb_article_topics_updated_at_trg
  before update on public.kb_article_topics
  for each row execute function public.kb_article_set_updated_at();

drop trigger if exists kb_article_target_journals_updated_at_trg on public.kb_article_target_journals;
create trigger kb_article_target_journals_updated_at_trg
  before update on public.kb_article_target_journals
  for each row execute function public.kb_article_set_updated_at();

drop trigger if exists kb_article_projects_updated_at_trg on public.kb_article_projects;
create trigger kb_article_projects_updated_at_trg
  before update on public.kb_article_projects
  for each row execute function public.kb_article_set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants (před RLS — RLS omezí na authenticated)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.kb_article_publications to authenticated;
grant select, insert, update, delete on public.kb_article_topics to authenticated;
grant select, insert, update, delete on public.kb_article_topic_publications to authenticated;
grant select, insert, update, delete on public.kb_article_target_journals to authenticated;
grant select, insert, update, delete on public.kb_article_projects to authenticated;
grant select, insert, update, delete on public.kb_article_versions to authenticated;
grant select, insert, update, delete on public.kb_article_ai_role_reviews to authenticated;
grant select, insert, update, delete on public.kb_article_literature_sources to authenticated;
grant select, insert, update, delete on public.kb_article_pipeline_runs to authenticated;
grant select, insert on public.kb_article_approvals to authenticated;
