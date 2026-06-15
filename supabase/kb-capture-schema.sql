-- Zachytávání znalostí – rozšíření znalostní báze (e-maily, poznámky, přílohy)

-- Sledování zdroje záznamu
alter table if exists public.kb_records add column if not exists source text;
alter table if exists public.kb_records add column if not exists message_id text;
alter table if exists public.kb_records add column if not exists received_at timestamptz;

comment on column public.kb_records.source is 'Zdroj: manual, paste, eml, email_forward, webhook';
comment on column public.kb_records.message_id is 'Message-ID e-mailu pro deduplikaci';

create unique index if not exists kb_records_message_id_uidx
  on public.kb_records (message_id)
  where message_id is not null and trim(message_id) <> '';

-- Přílohy k záznamům
create table if not exists public.kb_record_attachments (
  id uuid primary key default gen_random_uuid(),
  kb_id text not null,
  filename text not null,
  storage_path text,
  mime_type text,
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);

create index if not exists kb_record_attachments_kb_idx on public.kb_record_attachments (kb_id);

comment on table public.kb_record_attachments is 'Přílohy k záznamům znalostní báze (e-mail, soubory)';

-- INSERT do těla záznamu z aplikace
alter table if exists public.kb_record_bodies enable row level security;

drop policy if exists "kb_record_bodies authenticated insert" on public.kb_record_bodies;
create policy "kb_record_bodies authenticated insert"
  on public.kb_record_bodies for insert
  to authenticated
  with check (true);

drop policy if exists "kb_record_bodies authenticated update" on public.kb_record_bodies;
create policy "kb_record_bodies authenticated update"
  on public.kb_record_bodies for update
  to authenticated
  using (true)
  with check (true);

grant insert, update on public.kb_record_bodies to authenticated;

-- INSERT do metadat záznamu z aplikace
drop policy if exists "kb_records authenticated insert" on public.kb_records;
create policy "kb_records authenticated insert"
  on public.kb_records for insert
  to authenticated
  with check (true);

grant insert on public.kb_records to authenticated;

-- Přílohy – RLS
alter table public.kb_record_attachments enable row level security;

drop policy if exists "kb_record_attachments authenticated read" on public.kb_record_attachments;
drop policy if exists "kb_record_attachments authenticated write" on public.kb_record_attachments;

create policy "kb_record_attachments authenticated read"
  on public.kb_record_attachments for select to authenticated using (true);

create policy "kb_record_attachments authenticated write"
  on public.kb_record_attachments for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.kb_record_attachments to authenticated;
revoke all on public.kb_record_attachments from anon;

notify pgrst, 'reload schema';
