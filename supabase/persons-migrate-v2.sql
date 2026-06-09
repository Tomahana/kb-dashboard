-- Rozšíření kb_persons na 15 sloupců pro interní analýzy (spusťte po persons-schema.sql v1)
-- osobni_cislo se stává povinným unikátním obchodním klíčem.

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

-- Migrace z původních sloupců (titul_pred/titul_za, fakulta/katedra/soucast)
update public.kb_persons
set tituly = trim(both from concat_ws(', ',
  nullif(trim(coalesce(titul_pred, '')), ''),
  nullif(trim(coalesce(titul_za, '')), '')
))
where (tituly is null or tituly = '')
  and (titul_pred is not null or titul_za is not null);

update public.kb_persons
set pracoviste = trim(both from concat_ws(' · ',
  nullif(trim(coalesce(fakulta, '')), ''),
  nullif(trim(coalesce(katedra, '')), ''),
  nullif(trim(coalesce(soucast, '')), '')
))
where (pracoviste is null or pracoviste = '')
  and (fakulta is not null or katedra is not null or soucast is not null);

-- Doplnit chybějící osobni_cislo před NOT NULL
update public.kb_persons
set osobni_cislo = 'AUTO-' || left(replace(id::text, '-', ''), 12)
where osobni_cislo is null or trim(osobni_cislo) = '';

alter table public.kb_persons alter column osobni_cislo set not null;

drop index if exists kb_persons_osobni_cislo_idx;
create unique index if not exists kb_persons_osobni_cislo_uniq on public.kb_persons (osobni_cislo);

-- Odstranění zastaralých sloupců
alter table public.kb_persons drop column if exists titul_pred;
alter table public.kb_persons drop column if exists titul_za;
alter table public.kb_persons drop column if exists fakulta;
alter table public.kb_persons drop column if exists katedra;
alter table public.kb_persons drop column if exists soucast;
alter table public.kb_persons drop column if exists poznamka;

comment on table public.kb_persons is 'Centrální evidence osob UHK – 15 sloupců, osobni_cislo jako klíč pro vazby';
comment on column public.kb_persons.osobni_cislo is 'Obchodní klíč pro napojení projektů a dalších modulů';

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'kb_persons'
order by ordinal_position;
