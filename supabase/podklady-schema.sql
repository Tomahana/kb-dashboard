-- Podklady k jednáním — tabulka pro modul KB Dashboard
-- Spusťte v Supabase SQL Editoru po topics-schema.sql

create table if not exists public.podklady_jednani (
  id uuid primary key default gen_random_uuid(),
  nazev text not null,
  obsah text,
  stav text not null default 'K projednání',
  termin_jednani date,
  topic_id uuid references public.kb_topics(id) on delete set null,
  tagy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.podklady_jednani is 'Podklady k jednáním OVV — body, poznámky, termíny a vazba na témata';

create index if not exists podklady_jednani_stav_idx on public.podklady_jednani (stav);
create index if not exists podklady_jednani_termin_idx on public.podklady_jednani (termin_jednani);
create index if not exists podklady_jednani_topic_id_idx on public.podklady_jednani (topic_id);

create or replace function public.podklady_jednani_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists podklady_jednani_updated_at_trg on public.podklady_jednani;
create trigger podklady_jednani_updated_at_trg
  before update on public.podklady_jednani
  for each row execute function public.podklady_jednani_set_updated_at();

grant select, insert, update, delete on public.podklady_jednani to anon, authenticated;
alter table public.podklady_jednani enable row level security;

drop policy if exists "podklady_jednani authenticated read" on public.podklady_jednani;
create policy "podklady_jednani authenticated read"
  on public.podklady_jednani for select to authenticated using (true);

drop policy if exists "podklady_jednani authenticated write" on public.podklady_jednani;
create policy "podklady_jednani authenticated write"
  on public.podklady_jednani for all to authenticated using (true) with check (true);
