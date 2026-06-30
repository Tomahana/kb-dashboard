-- Modul DKRVO — evidence pracovišť, kódů a členů (napojení na web UHK).

create table if not exists public.kb_workplaces (
  id uuid primary key default gen_random_uuid(),
  kod text not null,
  nazev text not null,
  typ text not null default 'katedra',
  zkr_fak text,
  url text,
  web_text text,
  web_stazeno_at timestamptz,
  parent_id uuid references public.kb_workplaces (id) on delete set null,
  poznamka text,
  poradi int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kb_workplaces_kod_uniq on public.kb_workplaces (kod);

create index if not exists kb_workplaces_nazev_idx on public.kb_workplaces (nazev);
create index if not exists kb_workplaces_zkr_fak_idx on public.kb_workplaces (zkr_fak);
create index if not exists kb_workplaces_parent_idx on public.kb_workplaces (parent_id, poradi);

create table if not exists public.kb_workplace_members (
  id uuid primary key default gen_random_uuid(),
  workplace_id uuid not null references public.kb_workplaces (id) on delete cascade,
  jmeno text not null default '',
  tituly text,
  funkce text,
  email text,
  poznamka text,
  osobni_cislo text references public.kb_persons (osobni_cislo) on delete set null,
  poradi int not null default 0,
  aktivni boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_workplace_members_wp_idx on public.kb_workplace_members (workplace_id, poradi);

comment on table public.kb_workplaces is 'Pracoviště UHK pro DKRVO — kódy, názvy a odkazy na web';
comment on column public.kb_workplaces.kod is 'Kód pracoviště v DKRVO / IS VaVaI';
comment on table public.kb_workplace_members is 'Členové pracoviště s volitelným propojením na kb_persons';

create or replace function public.kb_workplaces_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_workplaces_updated_at_trg on public.kb_workplaces;
create trigger kb_workplaces_updated_at_trg
  before update on public.kb_workplaces for each row
  execute function public.kb_workplaces_set_updated_at();

create or replace function public.kb_workplace_members_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_workplace_members_updated_at_trg on public.kb_workplace_members;
create trigger kb_workplace_members_updated_at_trg
  before update on public.kb_workplace_members for each row
  execute function public.kb_workplace_members_set_updated_at();

grant select, insert, update, delete on public.kb_workplaces to anon, authenticated;
grant select, insert, update, delete on public.kb_workplace_members to anon, authenticated;

alter table public.kb_workplaces enable row level security;
alter table public.kb_workplace_members enable row level security;

drop policy if exists "kb_workplaces auth" on public.kb_workplaces;
create policy "kb_workplaces auth" on public.kb_workplaces for all to authenticated using (true) with check (true);

drop policy if exists "kb_workplace_members auth" on public.kb_workplace_members;
create policy "kb_workplace_members auth" on public.kb_workplace_members for all to authenticated using (true) with check (true);
