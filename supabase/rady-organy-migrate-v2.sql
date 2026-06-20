-- Migrace v2 — pracoviště členů orgánů (fakulta, katedra, působiště, kmenové pracoviště, síťové info)

alter table public.kb_organ_members add column if not exists fakulta text;
alter table public.kb_organ_members add column if not exists zkr_fak text;
alter table public.kb_organ_members add column if not exists katedra text;
alter table public.kb_organ_members add column if not exists pusobiste text;
alter table public.kb_organ_members add column if not exists kmenove_pracoviste text;
alter table public.kb_organ_members add column if not exists sitove_info text;

comment on column public.kb_organ_members.pusobiste is 'Působiště / zastoupení v orgánu (např. studenti FIM, externí expert)';
comment on column public.kb_organ_members.kmenove_pracoviste is 'Kmenové pracoviště — katedra, ústav, součást';
comment on column public.kb_organ_members.sitove_info is 'Síťové a networkingové poznámky pro budoucí využití';

notify pgrst, 'reload schema';
