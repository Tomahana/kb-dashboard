-- RLS pro modul Výstupy — spusťte po vystupy-schema.sql

alter table if exists public.kb_vystupy enable row level security;

drop policy if exists "kb_vystupy authenticated read" on public.kb_vystupy;
drop policy if exists "kb_vystupy authenticated write" on public.kb_vystupy;

create policy "kb_vystupy authenticated read"
  on public.kb_vystupy for select to authenticated using (true);

create policy "kb_vystupy authenticated write"
  on public.kb_vystupy for all to authenticated using (true) with check (true);

revoke all on public.kb_vystupy from anon;
grant select, insert, update, delete on public.kb_vystupy to authenticated;
