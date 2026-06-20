-- Doplňuje sloupec kodorg u kb_persons pro starší instalace.
-- Spusťte v Supabase SQL Editoru, pokud ukládání Osoby hlásí chybu „Could not find the 'kodorg' column…".
-- Bezpečné opakované spuštění.

alter table public.kb_persons add column if not exists kodorg text;

comment on column public.kb_persons.kodorg is 'Kód pracoviště z kb_pracoviste — kmenové pracoviště osoby';

update public.kb_persons set kodorg = null where trim(coalesce(kodorg, '')) = '';

alter table public.kb_persons drop constraint if exists kb_persons_kodorg_fk;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kb_pracoviste') then
    alter table public.kb_persons
      add constraint kb_persons_kodorg_fk
      foreign key (kodorg) references public.kb_pracoviste (kodorg)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

create index if not exists kb_persons_kodorg_idx on public.kb_persons (kodorg);

notify pgrst, 'reload schema';
