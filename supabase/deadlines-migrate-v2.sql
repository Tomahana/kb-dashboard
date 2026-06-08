-- Rozšíření kb_deadlines o sloupce z tabulky kolegů (spusťte po deadlines-schema.sql)

alter table public.kb_deadlines add column if not exists id_polozky text;
alter table public.kb_deadlines add column if not exists oblast text;
alter table public.kb_deadlines add column if not exists popis text;
alter table public.kb_deadlines add column if not exists potrebujeme_od text;
alter table public.kb_deadlines add column if not exists dodavatel_fakulta text;
alter table public.kb_deadlines add column if not exists kam_vyplnit text;
alter table public.kb_deadlines add column if not exists system_zdroj text;
alter table public.kb_deadlines add column if not exists termin_interni date;
alter table public.kb_deadlines add column if not exists ucel text;
alter table public.kb_deadlines add column if not exists navazny_proces text;
alter table public.kb_deadlines add column if not exists riziko text;

create index if not exists kb_deadlines_id_polozky_idx on public.kb_deadlines (id_polozky);
create index if not exists kb_deadlines_oblast_idx on public.kb_deadlines (oblast);
create index if not exists kb_deadlines_termin_interni_idx on public.kb_deadlines (termin_interni);

comment on column public.kb_deadlines.id_polozky is 'ID položky z evidence kolegů';
comment on column public.kb_deadlines.termin_sberu is 'Termín pro fakulty / součásti';
comment on column public.kb_deadlines.termin_interni is 'Interní termín pro zpracování na rektorátu';
comment on column public.kb_deadlines.termin_odeslani is 'Finální / externí termín';
