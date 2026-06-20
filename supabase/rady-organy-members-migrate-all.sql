-- Doplňuje všechny sloupce kb_organ_members pro starší instalace (CREATE TABLE IF NOT EXISTS je nepřidá).
-- Spusťte v Supabase SQL Editoru, pokud ukládání člena hlásí chybu „Could not find the 'fakulta' column…".
-- Bezpečné opakované spuštění.

alter table public.kb_organ_members add column if not exists fakulta text;
alter table public.kb_organ_members add column if not exists zkr_fak text;
alter table public.kb_organ_members add column if not exists katedra text;
alter table public.kb_organ_members add column if not exists pusobiste text;
alter table public.kb_organ_members add column if not exists kmenove_pracoviste text;
alter table public.kb_organ_members add column if not exists sitove_info text;
alter table public.kb_organ_members add column if not exists kodorg text;

comment on column public.kb_organ_members.pusobiste is 'Působiště / zastoupení v orgánu (např. studenti FIM, externí expert)';
comment on column public.kb_organ_members.kmenove_pracoviste is 'Kmenové pracoviště — katedra, ústav, součást';
comment on column public.kb_organ_members.sitove_info is 'Síťové a networkingové poznámky pro budoucí využití';
comment on column public.kb_organ_members.kodorg is 'Kód pracoviště z kb_pracoviste — kmenové pracoviště člena orgánu';

-- FK na kb_pracoviste (až po importu číselníku; jinak tento blok přeskočte)
update public.kb_organ_members set kodorg = null where trim(coalesce(kodorg, '')) = '';

alter table public.kb_organ_members drop constraint if exists kb_organ_members_kodorg_fk;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kb_pracoviste') then
    alter table public.kb_organ_members
      add constraint kb_organ_members_kodorg_fk
      foreign key (kodorg) references public.kb_pracoviste (kodorg)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

create index if not exists kb_organ_members_kodorg_idx on public.kb_organ_members (kodorg);

notify pgrst, 'reload schema';
