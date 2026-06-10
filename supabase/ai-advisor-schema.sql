-- =============================================================================
-- KB Dashboard – AI poradce: uložené dotazy a spojení (Fáze 2+)
-- =============================================================================
-- v1 používá localStorage; tento skript připraví trvalé ukládání v Supabase.
-- =============================================================================

create table if not exists public.kb_ai_advisor_saved (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('query', 'finding')),
  title text,
  query_text text,
  answer_text text,
  sources jsonb default '[]'::jsonb,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kb_ai_advisor_saved is 'Uložené dotazy a spojení z modulu AI poradce';

create index if not exists kb_ai_advisor_saved_kind_idx on public.kb_ai_advisor_saved (kind);
create index if not exists kb_ai_advisor_saved_created_idx on public.kb_ai_advisor_saved (created_at desc);

revoke all on public.kb_ai_advisor_saved from anon;
grant select, insert, update, delete on public.kb_ai_advisor_saved to authenticated;
