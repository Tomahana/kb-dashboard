-- =============================================================================
-- KB Dashboard – EIZ transformační smlouvy, roční tokeny a publikace
-- =============================================================================
-- Spusťte po persons-schema.sql (FK autor → kb_persons).
-- Fáze 1: ruční evidence smluv + tokenů po letech, import publikací z CSV.
-- =============================================================================

create table if not exists public.kb_eiz_contracts (
  id uuid primary key default gen_random_uuid(),
  nazev text not null,
  poskytovatel text,
  poznamka text,
  aktivni boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kb_eiz_contracts is 'Transformační smlouvy EIZ (vydavatel / platforma)';

create table if not exists public.kb_eiz_contract_years (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.kb_eiz_contracts(id) on delete cascade,
  rok integer not null check (rok >= 2000 and rok <= 2100),
  pocet_tokenu integer not null default 0 check (pocet_tokenu >= 0),
  poznamka text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_eiz_contract_years_contract_rok_unique unique (contract_id, rok)
);

comment on table public.kb_eiz_contract_years is 'Počet tokenů na transformační smlouvu a kalendářní rok';

create table if not exists public.kb_eiz_publications (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.kb_eiz_contracts(id) on delete cascade,
  source_key text not null,
  autor text,
  autor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  fakulta text,
  zkr_fak text,
  nazev_clanku text not null,
  doi text,
  datum_zadosti date,
  datum_prijeti date,
  usetrena_apc numeric(12, 2),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_eiz_publications_source_key_unique unique (source_key)
);

comment on table public.kb_eiz_publications is 'Publikace čerpané z transformační smlouvy (import CSV)';
comment on column public.kb_eiz_publications.source_key is 'Stabilní klíč pro upsert (smlouva + DOI nebo smlouva + autor + název + datum)';

create index if not exists kb_eiz_contract_years_contract_idx
  on public.kb_eiz_contract_years (contract_id);

create index if not exists kb_eiz_contract_years_rok_idx
  on public.kb_eiz_contract_years (rok);

create index if not exists kb_eiz_publications_contract_idx
  on public.kb_eiz_publications (contract_id);

create index if not exists kb_eiz_publications_doi_idx
  on public.kb_eiz_publications (lower(doi));

create index if not exists kb_eiz_publications_autor_cislo_idx
  on public.kb_eiz_publications (autor_osobni_cislo);

create or replace function public.kb_eiz_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_eiz_contracts_updated_at_trg on public.kb_eiz_contracts;
create trigger kb_eiz_contracts_updated_at_trg
  before update on public.kb_eiz_contracts
  for each row execute function public.kb_eiz_set_updated_at();

drop trigger if exists kb_eiz_contract_years_updated_at_trg on public.kb_eiz_contract_years;
create trigger kb_eiz_contract_years_updated_at_trg
  before update on public.kb_eiz_contract_years
  for each row execute function public.kb_eiz_set_updated_at();

drop trigger if exists kb_eiz_publications_updated_at_trg on public.kb_eiz_publications;
create trigger kb_eiz_publications_updated_at_trg
  before update on public.kb_eiz_publications
  for each row execute function public.kb_eiz_set_updated_at();

grant select, insert, update, delete on public.kb_eiz_contracts to anon, authenticated;
grant select, insert, update, delete on public.kb_eiz_contract_years to anon, authenticated;
grant select, insert, update, delete on public.kb_eiz_publications to anon, authenticated;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('kb_eiz_contracts', 'kb_eiz_contract_years', 'kb_eiz_publications')
order by table_name;
