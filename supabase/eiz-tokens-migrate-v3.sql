-- Migrace EIZ tokenů v3 — explicitní rok u publikací
-- Spusťte po eiz-tokens-schema.sql / migrate-v2.sql

alter table if exists public.kb_eiz_publications
  add column if not exists rok integer check (rok is null or (rok >= 2000 and rok <= 2100));

comment on column public.kb_eiz_publications.rok is 'Kalendářní rok přiřazení publikace k čerpání smlouvy';

update public.kb_eiz_publications
set rok = extract(year from coalesce(datum_prijeti, datum_zadosti))::integer
where rok is null
  and coalesce(datum_prijeti, datum_zadosti) is not null;

create index if not exists kb_eiz_publications_rok_idx
  on public.kb_eiz_publications (rok);

select id, rok, nazev_clanku, datum_prijeti, datum_zadosti
from public.kb_eiz_publications
order by rok desc nulls last, nazev_clanku
limit 20;
