-- Modul Rady a orgány UHK — evidence orgánů, členů, jednacích řádů, aktualit a AI kontrol personálních změn.

create table if not exists public.kb_organs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  nazev text not null,
  url text,
  ucel_summary text,
  jednaci_rad_url text,
  jednaci_rad_text text,
  jednaci_rad_stazeno_at timestamptz,
  aktuality_url text,
  aktuality_text text,
  aktuality_stazeno_at timestamptz,
  poznamka text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kb_organs_slug_uniq on public.kb_organs (slug);

create table if not exists public.kb_organ_members (
  id uuid primary key default gen_random_uuid(),
  organ_id uuid not null references public.kb_organs (id) on delete cascade,
  jmeno text not null default '',
  tituly text,
  funkce text,
  email text,
  poznamka text,
  fakulta text,
  zkr_fak text,
  katedra text,
  pusobiste text,
  kmenove_pracoviste text,
  sitove_info text,
  osobni_cislo text references public.kb_persons (osobni_cislo) on delete set null,
  poradi int not null default 0,
  aktivni boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_organ_members_organ_idx on public.kb_organ_members (organ_id, poradi);

create table if not exists public.kb_organ_personnel_checks (
  id uuid primary key default gen_random_uuid(),
  organ_id uuid not null references public.kb_organs (id) on delete cascade,
  checked_at timestamptz not null default now(),
  source_text text,
  ai_result jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists kb_organ_checks_organ_idx on public.kb_organ_personnel_checks (organ_id, checked_at desc);

comment on table public.kb_organs is 'Univerzitní rady a orgány — metadata, účel, jednací řády a aktuality';
comment on table public.kb_organ_members is 'Členové orgánů s poznámkami a volitelným propojením na kb_persons';
comment on table public.kb_organ_personnel_checks is 'Historie AI kontrol personálních změn na webu UHK';

create or replace function public.kb_organs_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_organs_updated_at_trg on public.kb_organs;
create trigger kb_organs_updated_at_trg
  before update on public.kb_organs for each row
  execute function public.kb_organs_set_updated_at();

create or replace function public.kb_organ_members_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_organ_members_updated_at_trg on public.kb_organ_members;
create trigger kb_organ_members_updated_at_trg
  before update on public.kb_organ_members for each row
  execute function public.kb_organ_members_set_updated_at();

grant select, insert, update, delete on public.kb_organs to anon, authenticated;
grant select, insert, update, delete on public.kb_organ_members to anon, authenticated;
grant select, insert, update, delete on public.kb_organ_personnel_checks to anon, authenticated;

alter table public.kb_organs enable row level security;
alter table public.kb_organ_members enable row level security;
alter table public.kb_organ_personnel_checks enable row level security;

drop policy if exists "kb_organs auth" on public.kb_organs;
create policy "kb_organs auth" on public.kb_organs for all to authenticated using (true) with check (true);

drop policy if exists "kb_organ_members auth" on public.kb_organ_members;
create policy "kb_organ_members auth" on public.kb_organ_members for all to authenticated using (true) with check (true);

drop policy if exists "kb_organ_personnel_checks auth" on public.kb_organ_personnel_checks;
create policy "kb_organ_personnel_checks auth" on public.kb_organ_personnel_checks for all to authenticated using (true) with check (true);
