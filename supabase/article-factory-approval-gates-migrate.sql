-- =============================================================================
-- Article Factory — povinné lidské schvalovací body
-- Spusťte po article-factory-schema.sql a před použitím řízené pipeline.
-- =============================================================================

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

create index if not exists kb_article_approvals_checkpoint_idx
  on public.kb_article_approvals (article_project_id, checkpoint, created_at desc);

comment on table public.kb_article_approvals is
  'Neměnný audit lidských rozhodnutí mezi etapami Article Factory; schválení nikdy neznamená odeslání rukopisu.';

grant select, insert on public.kb_article_approvals to authenticated;
revoke all on public.kb_article_approvals from anon;

alter table public.kb_article_approvals enable row level security;

drop policy if exists "kb_article_approvals authenticated read" on public.kb_article_approvals;
drop policy if exists "kb_article_approvals authenticated insert" on public.kb_article_approvals;

create policy "kb_article_approvals authenticated read"
  on public.kb_article_approvals for select to authenticated
  using (decided_by = auth.uid());

create policy "kb_article_approvals authenticated insert"
  on public.kb_article_approvals for insert to authenticated
  with check (decided_by = auth.uid());
