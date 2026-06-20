-- Přesun dat z kb_pracoviste_import → kb_pracoviste (upsert podle kodorg).
-- Před spuštěním: CSV/TSV naimportujte do kb_pracoviste_import.
-- Sloupce: kodorg, nazev, kodorg_rodic (viz data/pracoviste-import.example.tsv)
--
-- Pořadí: nejdříve spusťte pracoviste-schema.sql a pracoviste-import-staging.sql.

create or replace function public.kb_pracoviste_normalize_kod(raw text)
returns text language sql immutable as $$
  select nullif(trim(coalesce(raw, '')), '');
$$;

create or replace function public.kb_pracoviste_normalize_rodic(raw text)
returns text language sql immutable as $$
  select case
    when nullif(trim(lower(coalesce(raw, ''))), '') is null then null
    when trim(lower(raw)) in ('null', '0', '') then null
    else trim(raw)
  end;
$$;

-- Kořen univerzity
insert into public.kb_pracoviste (kodorg, nazev, kodorg_rodic)
values ('0', 'Univerzita Hradec Králové', null)
on conflict (kodorg) do nothing;

-- 1. kolo — řádky bez rodiče nebo s rodičem 0 (fakulty, rektorát…)
insert into public.kb_pracoviste (kodorg, nazev, kodorg_rodic)
select
  public.kb_pracoviste_normalize_kod(i.kodorg),
  trim(i.nazev),
  case
    when public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) is null then null
    when public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) = '0' then '0'
    else public.kb_pracoviste_normalize_rodic(i.kodorg_rodic)
  end
from public.kb_pracoviste_import i
where public.kb_pracoviste_normalize_kod(i.kodorg) is not null
  and trim(coalesce(i.nazev, '')) <> ''
  and (
    public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) is null
    or public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) = '0'
  )
on conflict (kodorg) do update set
  nazev = excluded.nazev,
  kodorg_rodic = excluded.kodorg_rodic,
  updated_at = now();

-- 2. kolo — podřízená pracoviště (opakujte dotaz, dokud insert/update nevrátí 0 řádků; typicky 3–6 kol)
insert into public.kb_pracoviste (kodorg, nazev, kodorg_rodic)
select
  public.kb_pracoviste_normalize_kod(i.kodorg),
  trim(i.nazev),
  public.kb_pracoviste_normalize_rodic(i.kodorg_rodic)
from public.kb_pracoviste_import i
where public.kb_pracoviste_normalize_kod(i.kodorg) is not null
  and trim(coalesce(i.nazev, '')) <> ''
  and public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) is not null
  and public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) <> '0'
  and exists (
    select 1 from public.kb_pracoviste p
    where p.kodorg = public.kb_pracoviste_normalize_rodic(i.kodorg_rodic)
  )
on conflict (kodorg) do update set
  nazev = excluded.nazev,
  kodorg_rodic = excluded.kodorg_rodic,
  updated_at = now();

-- Znovu spusťte předchozí INSERT (2. kolo) 2–4×, pokud import obsahuje hlubokou hierarchii.
-- Nebo spusťte celý soubor znovu — upsert je idempotentní.

-- Kontrola: pracoviště bez existujícího rodiče
select i.kodorg, i.nazev, i.kodorg_rodic as chybejici_rodic
from public.kb_pracoviste_import i
where public.kb_pracoviste_normalize_kod(i.kodorg) is not null
  and public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) is not null
  and public.kb_pracoviste_normalize_rodic(i.kodorg_rodic) <> '0'
  and not exists (
    select 1 from public.kb_pracoviste p
    where p.kodorg = public.kb_pracoviste_normalize_rodic(i.kodorg_rodic)
  );

-- Po úspěšném importu (volitelně):
-- truncate public.kb_pracoviste_import;

select count(*) as pocet_pracovist from public.kb_pracoviste;
