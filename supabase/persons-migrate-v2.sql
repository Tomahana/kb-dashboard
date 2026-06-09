-- Rozšíření kb_persons na 15 sloupců pro interní analýzy
-- Bezpečné pro opakované spuštění i pokud už máte nové schéma (bez titul_pred, fakulta, …).
--
-- Nová instalace: stačí supabase/persons-schema.sql
-- Upgrade ze starého schématu (titul_pred, fakulta, …): spusťte tento soubor

alter table public.kb_persons add column if not exists tituly text;
alter table public.kb_persons add column if not exists stav_osoby text;
alter table public.kb_persons add column if not exists pracoviste text;
alter table public.kb_persons add column if not exists rodne_cislo text;
alter table public.kb_persons add column if not exists datum_narozeni date;
alter table public.kb_persons add column if not exists obcanstvi text;
alter table public.kb_persons add column if not exists pohlavi text;
alter table public.kb_persons add column if not exists orcid text;
alter table public.kb_persons add column if not exists researcher_id text;
alter table public.kb_persons add column if not exists scopus_id text;

-- Migrace titul_pred + titul_za → tituly (jen pokud staré sloupce existují)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kb_persons' and column_name = 'titul_pred'
  ) then
    execute $sql$
      update public.kb_persons
      set tituly = trim(both from concat_ws(', ',
        nullif(trim(coalesce(titul_pred, '')), ''),
        nullif(trim(coalesce(titul_za, '')), '')
      ))
      where (tituly is null or tituly = '')
        and (titul_pred is not null or titul_za is not null)
    $sql$;
    raise notice 'Migrováno titul_pred/titul_za → tituly';
  else
    raise notice 'Sloupce titul_pred/titul_za neexistují – přeskočeno';
  end if;
end $$;

-- Migrace fakulta + katedra + soucast → pracoviste (jen pokud staré sloupce existují)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kb_persons' and column_name = 'fakulta'
  ) then
    execute $sql$
      update public.kb_persons
      set pracoviste = trim(both from concat_ws(' · ',
        nullif(trim(coalesce(fakulta, '')), ''),
        nullif(trim(coalesce(katedra, '')), ''),
        nullif(trim(coalesce(soucast, '')), '')
      ))
      where (pracoviste is null or pracoviste = '')
        and (fakulta is not null or katedra is not null or soucast is not null)
    $sql$;
    raise notice 'Migrováno fakulta/katedra/soucast → pracoviste';
  else
    raise notice 'Sloupce fakulta/katedra/soucast neexistují – přeskočeno';
  end if;
end $$;

-- Doplnit chybějící osobni_cislo před NOT NULL
update public.kb_persons
set osobni_cislo = 'AUTO-' || left(replace(id::text, '-', ''), 12)
where osobni_cislo is null or trim(osobni_cislo) = '';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kb_persons'
      and column_name = 'osobni_cislo' and is_nullable = 'YES'
  ) then
    alter table public.kb_persons alter column osobni_cislo set not null;
    raise notice 'osobni_cislo nastaveno na NOT NULL';
  else
    raise notice 'osobni_cislo už je NOT NULL – přeskočeno';
  end if;
end $$;

drop index if exists kb_persons_osobni_cislo_idx;
create unique index if not exists kb_persons_osobni_cislo_uniq on public.kb_persons (osobni_cislo);

alter table public.kb_persons drop column if exists titul_pred;
alter table public.kb_persons drop column if exists titul_za;
alter table public.kb_persons drop column if exists fakulta;
alter table public.kb_persons drop column if exists katedra;
alter table public.kb_persons drop column if exists soucast;
alter table public.kb_persons drop column if exists poznamka;

comment on table public.kb_persons is 'Centrální evidence osob UHK – 15 sloupců, osobni_cislo jako klíč pro vazby';
comment on column public.kb_persons.osobni_cislo is 'Obchodní klíč pro napojení projektů a dalších modulů';

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'kb_persons'
order by ordinal_position;
