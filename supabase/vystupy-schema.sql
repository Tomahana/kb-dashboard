-- =============================================================================
-- KB Dashboard – Výstupy (samostatné tabulky Jimp, JSC, B, C)
-- =============================================================================
-- Pořadí nasazení:
--   1) supabase/persons-schema.sql
--   2) tento soubor (vystupy-schema.sql) — včetně RLS na konci
--   3) volitelně znovu: supabase/vystupy-rls.sql (idempotentní oprava RLS)
-- =============================================================================

-- Odstranění předchozí sjednocené tabulky (pokud existuje z dřívější verze)
drop table if exists public.kb_vystupy cascade;

-- ---------------------------------------------------------------------------
-- Jimp — články v impaktovaných časopisech
-- ---------------------------------------------------------------------------
create table if not exists public.kb_vystupy_jimp (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  rok integer check (rok is null or (rok >= 1990 and rok <= 2100)),
  nazev text not null,
  autor text,
  autor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  fakulta text,
  zkr_fak text,
  katedra text,
  doi text,
  issn text,
  casopis text,
  riv_id text,
  cislo_na_riv text,
  poznamka text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_vystupy_jimp_source_key_unique unique (source_key)
);

comment on table public.kb_vystupy_jimp is 'Výstupy typu Jimp — články v impaktovaných časopisech';

-- ---------------------------------------------------------------------------
-- JSC — články v recenzovaných časopisech
-- ---------------------------------------------------------------------------
create table if not exists public.kb_vystupy_jsc (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  rok integer check (rok is null or (rok >= 1990 and rok <= 2100)),
  nazev text not null,
  autor text,
  autor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  fakulta text,
  zkr_fak text,
  katedra text,
  doi text,
  issn text,
  casopis text,
  riv_id text,
  cislo_na_riv text,
  poznamka text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_vystupy_jsc_source_key_unique unique (source_key)
);

comment on table public.kb_vystupy_jsc is 'Výstupy typu JSC — články v recenzovaných časopisech';

-- ---------------------------------------------------------------------------
-- B — monografie
-- ---------------------------------------------------------------------------
create table if not exists public.kb_vystupy_b (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  rok integer check (rok is null or (rok >= 1990 and rok <= 2100)),
  nazev text not null,
  autor text,
  autor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  fakulta text,
  zkr_fak text,
  katedra text,
  isbn text,
  riv_id text,
  cislo_na_riv text,
  poznamka text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_vystupy_b_source_key_unique unique (source_key)
);

comment on table public.kb_vystupy_b is 'Výstupy typu B — monografie';

-- ---------------------------------------------------------------------------
-- C — kapitoly v odborných knihách
-- ---------------------------------------------------------------------------
create table if not exists public.kb_vystupy_c (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  rok integer check (rok is null or (rok >= 1990 and rok <= 2100)),
  nazev text not null,
  autor text,
  autor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  fakulta text,
  zkr_fak text,
  katedra text,
  isbn text,
  riv_id text,
  cislo_na_riv text,
  poznamka text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_vystupy_c_source_key_unique unique (source_key)
);

comment on table public.kb_vystupy_c is 'Výstupy typu C — kapitoly v odborných knihách';

-- ---------------------------------------------------------------------------
-- Indexy
-- ---------------------------------------------------------------------------
create index if not exists kb_vystupy_jimp_rok_idx on public.kb_vystupy_jimp (rok);
create index if not exists kb_vystupy_jimp_zkr_fak_idx on public.kb_vystupy_jimp (zkr_fak);
create index if not exists kb_vystupy_jimp_autor_cislo_idx on public.kb_vystupy_jimp (autor_osobni_cislo);
create index if not exists kb_vystupy_jimp_riv_id_idx on public.kb_vystupy_jimp (riv_id);

create index if not exists kb_vystupy_jsc_rok_idx on public.kb_vystupy_jsc (rok);
create index if not exists kb_vystupy_jsc_zkr_fak_idx on public.kb_vystupy_jsc (zkr_fak);
create index if not exists kb_vystupy_jsc_autor_cislo_idx on public.kb_vystupy_jsc (autor_osobni_cislo);
create index if not exists kb_vystupy_jsc_riv_id_idx on public.kb_vystupy_jsc (riv_id);

create index if not exists kb_vystupy_b_rok_idx on public.kb_vystupy_b (rok);
create index if not exists kb_vystupy_b_zkr_fak_idx on public.kb_vystupy_b (zkr_fak);
create index if not exists kb_vystupy_b_autor_cislo_idx on public.kb_vystupy_b (autor_osobni_cislo);
create index if not exists kb_vystupy_b_riv_id_idx on public.kb_vystupy_b (riv_id);

create index if not exists kb_vystupy_c_rok_idx on public.kb_vystupy_c (rok);
create index if not exists kb_vystupy_c_zkr_fak_idx on public.kb_vystupy_c (zkr_fak);
create index if not exists kb_vystupy_c_autor_cislo_idx on public.kb_vystupy_c (autor_osobni_cislo);
create index if not exists kb_vystupy_c_riv_id_idx on public.kb_vystupy_c (riv_id);

-- ---------------------------------------------------------------------------
-- Trigger updated_at (sdílená funkce)
-- ---------------------------------------------------------------------------
create or replace function public.kb_vystupy_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_vystupy_jimp_updated_at_trg on public.kb_vystupy_jimp;
create trigger kb_vystupy_jimp_updated_at_trg
  before update on public.kb_vystupy_jimp
  for each row execute function public.kb_vystupy_set_updated_at();

drop trigger if exists kb_vystupy_jsc_updated_at_trg on public.kb_vystupy_jsc;
create trigger kb_vystupy_jsc_updated_at_trg
  before update on public.kb_vystupy_jsc
  for each row execute function public.kb_vystupy_set_updated_at();

drop trigger if exists kb_vystupy_b_updated_at_trg on public.kb_vystupy_b;
create trigger kb_vystupy_b_updated_at_trg
  before update on public.kb_vystupy_b
  for each row execute function public.kb_vystupy_set_updated_at();

drop trigger if exists kb_vystupy_c_updated_at_trg on public.kb_vystupy_c;
create trigger kb_vystupy_c_updated_at_trg
  before update on public.kb_vystupy_c
  for each row execute function public.kb_vystupy_set_updated_at();

grant select, insert, update, delete on public.kb_vystupy_jimp to anon, authenticated;
grant select, insert, update, delete on public.kb_vystupy_jsc to anon, authenticated;
grant select, insert, update, delete on public.kb_vystupy_b to anon, authenticated;
grant select, insert, update, delete on public.kb_vystupy_c to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS (volitelně lze znovu spustit samostatně: vystupy-rls.sql)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['kb_vystupy_jimp', 'kb_vystupy_jsc', 'kb_vystupy_b', 'kb_vystupy_c']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated read" on public.%I', t, t);
    execute format('drop policy if exists "%s authenticated write" on public.%I', t, t);
    execute format(
      'create policy "%s authenticated read" on public.%I for select to authenticated using (true)',
      t, t
    );
    execute format(
      'create policy "%s authenticated write" on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('kb_vystupy_jimp', 'kb_vystupy_jsc', 'kb_vystupy_b', 'kb_vystupy_c')
order by table_name;
