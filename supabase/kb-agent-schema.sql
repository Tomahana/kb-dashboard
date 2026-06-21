-- KB Agent — tabulky pro Notion sync (kb_items, kb_pending, notion_pages_processed)
-- Spusťte v Supabase SQL Editoru před nasazením edge-functions/kb-agent

create table if not exists public.kb_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  title text not null,
  content text,
  status text not null default 'open',
  priority text default 'medium',
  evidence text,
  topics text[] default '{}',
  owner text,
  deadline timestamptz,
  confidence numeric(4,3),
  source_notion_page_url text,
  notion_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists kb_items_created_at_idx on public.kb_items (created_at desc);
create index if not exists kb_items_notion_page_id_idx on public.kb_items (notion_page_id);
create index if not exists kb_items_item_type_idx on public.kb_items (item_type);

create table if not exists public.kb_pending (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  title text not null,
  content text,
  status text default 'open',
  priority text default 'medium',
  confidence numeric(4,3) not null,
  evidence text,
  source_notion_page_url text,
  notion_page_id text,
  raw_classification jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kb_pending_confidence_idx on public.kb_pending (confidence);
create index if not exists kb_pending_notion_page_id_idx on public.kb_pending (notion_page_id);

create table if not exists public.notion_pages_processed (
  page_id text primary key,
  notion_last_edited timestamptz,
  processed_at timestamptz not null default now(),
  items_saved int not null default 0,
  items_pending int not null default 0
);

alter table public.kb_items enable row level security;
alter table public.kb_pending enable row level security;
alter table public.notion_pages_processed enable row level security;

-- Čtení pro přihlášené uživatele (KB Dashboard)
drop policy if exists kb_items_select_authenticated on public.kb_items;
create policy kb_items_select_authenticated on public.kb_items
  for select to authenticated using (true);

drop policy if exists kb_items_write_authenticated on public.kb_items;
create policy kb_items_write_authenticated on public.kb_items
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.kb_items to authenticated;

drop policy if exists kb_pending_select_authenticated on public.kb_pending;
create policy kb_pending_select_authenticated on public.kb_pending
  for select to authenticated using (true);

-- Zápis pouze service role (edge function) — žádná insert policy pro authenticated
