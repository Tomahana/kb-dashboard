-- Connect: alokovaná částka u přihlášky (může být nižší než financni_pozadavek u Cut)
alter table public.kb_competition_applications add column if not exists castka_alokovana numeric(14, 2);

comment on column public.kb_competition_applications.castka_alokovana is 'Skutečně alokovaná částka (Connect Cut); null = shodná s požadavkem';

notify pgrst, 'reload schema';
