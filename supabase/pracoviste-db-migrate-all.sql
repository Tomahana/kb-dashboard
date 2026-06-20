-- Jednorázová migrace propojení pracovišť — Osoby + Rady a orgány.
-- Spusťte v Supabase SQL Editoru při chybách „Could not find the 'kodorg' / 'fakulta' column…".
-- Bezpečné opakované spuštění. FK na kb_pracoviste se přidá jen pokud tabulka číselníku existuje.

-- === kb_persons ===
alter table public.kb_persons add column if not exists kodorg text;
comment on column public.kb_persons.kodorg is 'Kód pracoviště z kb_pracoviste — kmenové pracoviště osoby';
update public.kb_persons set kodorg = null where trim(coalesce(kodorg, '')) = '';
alter table public.kb_persons drop constraint if exists kb_persons_kodorg_fk;
create index if not exists kb_persons_kodorg_idx on public.kb_persons (kodorg);

-- === kb_organ_members ===
alter table public.kb_organ_members add column if not exists fakulta text;
alter table public.kb_organ_members add column if not exists zkr_fak text;
alter table public.kb_organ_members add column if not exists katedra text;
alter table public.kb_organ_members add column if not exists pusobiste text;
alter table public.kb_organ_members add column if not exists kmenove_pracoviste text;
alter table public.kb_organ_members add column if not exists sitove_info text;
alter table public.kb_organ_members add column if not exists kodorg text;
comment on column public.kb_organ_members.kodorg is 'Kód pracoviště z kb_pracoviste — kmenové pracoviště člena orgánu';
update public.kb_organ_members set kodorg = null where trim(coalesce(kodorg, '')) = '';
alter table public.kb_organ_members drop constraint if exists kb_organ_members_kodorg_fk;
create index if not exists kb_organ_members_kodorg_idx on public.kb_organ_members (kodorg);

-- === FK (jen pokud existuje kb_pracoviste) ===
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kb_pracoviste') then
    alter table public.kb_persons
      add constraint kb_persons_kodorg_fk
      foreign key (kodorg) references public.kb_pracoviste (kodorg)
      on delete set null
      deferrable initially deferred;
    alter table public.kb_organ_members
      add constraint kb_organ_members_kodorg_fk
      foreign key (kodorg) references public.kb_pracoviste (kodorg)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

notify pgrst, 'reload schema';
