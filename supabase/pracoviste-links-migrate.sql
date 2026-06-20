-- Propojení číselníku kb_pracoviste s Osobami a Rady a orgány (kodorg jako FK).

alter table public.kb_persons
  add column if not exists kodorg text;

alter table public.kb_organ_members
  add column if not exists kodorg text;

-- FK až po naplnění kb_pracoviste (prázdný kodorg = NULL)
update public.kb_persons set kodorg = null where trim(coalesce(kodorg, '')) = '';
update public.kb_organ_members set kodorg = null where trim(coalesce(kodorg, '')) = '';

alter table public.kb_persons drop constraint if exists kb_persons_kodorg_fk;
alter table public.kb_persons
  add constraint kb_persons_kodorg_fk
  foreign key (kodorg) references public.kb_pracoviste (kodorg)
  on delete set null
  deferrable initially deferred;

alter table public.kb_organ_members drop constraint if exists kb_organ_members_kodorg_fk;
alter table public.kb_organ_members
  add constraint kb_organ_members_kodorg_fk
  foreign key (kodorg) references public.kb_pracoviste (kodorg)
  on delete set null
  deferrable initially deferred;

create index if not exists kb_persons_kodorg_idx on public.kb_persons (kodorg);
create index if not exists kb_organ_members_kodorg_idx on public.kb_organ_members (kodorg);

comment on column public.kb_persons.kodorg is 'Kód pracoviště z kb_pracoviste — kmenové pracoviště osoby';
comment on column public.kb_organ_members.kodorg is 'Kód pracoviště z kb_pracoviste — kmenové pracoviště člena orgánu';

notify pgrst, 'reload schema';
