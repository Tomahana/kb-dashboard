-- Přesun dat z kb_persons_import → kb_persons (upsert podle osobni_cislo)
-- Před spuštěním: CSV naimportujte do kb_persons_import (viz persons-import-staging.sql)
--
-- Pokud má CSV české hlavičky, přejmenujte je před importem na:
-- prijmeni, jmeno, tituly, osobni_cislo, stav_osoby, pracoviste, rodne_cislo,
-- email, telefon, datum_narozeni, obcanstvi, pohlavi, orcid, researcher_id, scopus_id

create or replace function public.kb_parse_import_date(raw text)
returns date language plpgsql immutable as $$
declare v text := trim(coalesce(raw, ''));
begin
  if v = '' or v in ('-', '—') then return null; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}' then return left(v, 10)::date; end if;
  if v ~ '^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}' then
    return to_date(regexp_replace(v, '[.\-/]', '.', 'g'), 'DD.MM.YYYY');
  end if;
  return null;
exception when others then
  return null;
end;
$$;

insert into public.kb_persons (
  prijmeni, jmeno, tituly, osobni_cislo, stav_osoby, pracoviste,
  rodne_cislo, email, telefon, datum_narozeni, obcanstvi, pohlavi,
  orcid, researcher_id, scopus_id
)
select
  trim(prijmeni),
  trim(jmeno),
  nullif(trim(tituly), ''),
  trim(osobni_cislo),
  nullif(trim(stav_osoby), ''),
  nullif(trim(pracoviste), ''),
  nullif(trim(rodne_cislo), ''),
  nullif(trim(email), ''),
  nullif(trim(telefon), ''),
  public.kb_parse_import_date(datum_narozeni),
  nullif(trim(obcanstvi), ''),
  nullif(trim(pohlavi), ''),
  nullif(trim(orcid), ''),
  nullif(trim(researcher_id), ''),
  nullif(trim(scopus_id), '')
from public.kb_persons_import
where trim(coalesce(osobni_cislo, '')) <> ''
  and trim(coalesce(prijmeni, '')) <> ''
  and trim(coalesce(jmeno, '')) <> ''
on conflict (osobni_cislo) do update set
  prijmeni = excluded.prijmeni,
  jmeno = excluded.jmeno,
  tituly = excluded.tituly,
  stav_osoby = excluded.stav_osoby,
  pracoviste = excluded.pracoviste,
  rodne_cislo = excluded.rodne_cislo,
  email = excluded.email,
  telefon = excluded.telefon,
  datum_narozeni = excluded.datum_narozeni,
  obcanstvi = excluded.obcanstvi,
  pohlavi = excluded.pohlavi,
  orcid = excluded.orcid,
  researcher_id = excluded.researcher_id,
  scopus_id = excluded.scopus_id,
  updated_at = now();

select
  (select count(*) from public.kb_persons_import) as import_rows,
  (select count(*) from public.kb_persons) as persons_total;

-- Volitelně po úspěšném importu:
-- truncate public.kb_persons_import;
