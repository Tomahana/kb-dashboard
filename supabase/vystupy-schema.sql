-- =============================================================================
-- KB Dashboard – Výstupy (publikační výstupy + aplikované výsledky)
-- =============================================================================
-- Spusťte po persons-schema.sql (FK autor/resitel → kb_persons).
-- Typy: Jimp, JSC, B, C (publikační) + aplikované výsledky (RIV kódy D–Z).
-- Použití: analýzy, DKRVO, PPK.
-- =============================================================================

create table if not exists public.kb_vystupy (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  kategorie text not null default 'publikacni'
    check (kategorie in ('publikacni', 'aplikovany')),
  typ_vystupu text not null,
  rok integer check (rok is null or (rok >= 1990 and rok <= 2100)),
  nazev text not null,
  autor text,
  autor_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  resitel text,
  resitel_osobni_cislo text references public.kb_persons(osobni_cislo) on delete set null,
  fakulta text,
  zkr_fak text,
  katedra text,
  doi text,
  issn text,
  casopis text,
  isbn text,
  riv_id text,
  cislo_na_riv text,
  druh_vysledku text,
  poznamka text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_vystupy_source_key_unique unique (source_key)
);

comment on table public.kb_vystupy is 'Výzkumné výstupy UHK — publikace (Jimp, JSC, B, C) a aplikované výsledky pro DKRVO, PPK a analýzy';
comment on column public.kb_vystupy.kategorie is 'publikacni = články, monografie, kapitoly; aplikovany = patenty, software, technologie…';
comment on column public.kb_vystupy.typ_vystupu is 'Jimp, JSC, B, C (publikační) nebo RIV kód aplikovaného výsledku (D, F, G, …)';
comment on column public.kb_vystupy.source_key is 'Stabilní klíč pro upsert při importu (typ + rok + RIV/DOI/ISBN + autor)';
comment on column public.kb_vystupy.riv_id is 'Identifikátor v IS VaVaI / RIV';

create index if not exists kb_vystupy_typ_idx on public.kb_vystupy (typ_vystupu);
create index if not exists kb_vystupy_kategorie_idx on public.kb_vystupy (kategorie);
create index if not exists kb_vystupy_rok_idx on public.kb_vystupy (rok);
create index if not exists kb_vystupy_zkr_fak_idx on public.kb_vystupy (zkr_fak);
create index if not exists kb_vystupy_autor_cislo_idx on public.kb_vystupy (autor_osobni_cislo);
create index if not exists kb_vystupy_resitel_cislo_idx on public.kb_vystupy (resitel_osobni_cislo);
create index if not exists kb_vystupy_riv_id_idx on public.kb_vystupy (riv_id);

create or replace function public.kb_vystupy_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_vystupy_updated_at_trg on public.kb_vystupy;
create trigger kb_vystupy_updated_at_trg
  before update on public.kb_vystupy
  for each row execute function public.kb_vystupy_set_updated_at();

grant select, insert, update, delete on public.kb_vystupy to anon, authenticated;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'kb_vystupy';
