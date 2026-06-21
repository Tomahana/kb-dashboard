-- Rozšíření kb_items pro dashboard (topics, owner, deadline, confidence, updated_at)
-- + RLS zápis pro přihlášené uživatele
-- Spusťte v Supabase SQL Editoru po kb-agent-schema.sql

alter table public.kb_items add column if not exists topics text[] default '{}';
alter table public.kb_items add column if not exists owner text;
alter table public.kb_items add column if not exists deadline timestamptz;
alter table public.kb_items add column if not exists confidence numeric(4,3);
alter table public.kb_items add column if not exists updated_at timestamptz default now();

comment on column public.kb_items.topics is 'Témata z KB agenta nebo ruční doplnění';
comment on column public.kb_items.owner is 'Vlastník / odpovědná osoba';
comment on column public.kb_items.deadline is 'Termín splnění';
comment on column public.kb_items.confidence is 'Jistota klasifikace 0–1';

create index if not exists kb_items_owner_idx on public.kb_items (owner);
create index if not exists kb_items_topics_idx on public.kb_items using gin (topics);

create or replace function public.kb_items_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_items_updated_at_trg on public.kb_items;
create trigger kb_items_updated_at_trg
  before update on public.kb_items
  for each row execute function public.kb_items_set_updated_at();

drop policy if exists kb_items_write_authenticated on public.kb_items;
create policy kb_items_write_authenticated on public.kb_items
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.kb_items to authenticated;
