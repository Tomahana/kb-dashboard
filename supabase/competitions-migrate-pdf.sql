-- Migrace: Pokyn a Výzva jako PDF soubory (název souboru + cesta / data URL)

alter table public.kb_competitions add column if not exists pokyn_nazev text;
alter table public.kb_competitions add column if not exists vyvza_nazev text;

comment on column public.kb_competitions.pokyn is 'Cesta k PDF v Supabase Storage (kb-competition-docs) nebo data URL v localStorage';
comment on column public.kb_competitions.pokyn_nazev is 'Původní název souboru pokynu (PDF)';
comment on column public.kb_competitions.vyvza is 'Cesta k PDF v Supabase Storage nebo data URL v localStorage';
comment on column public.kb_competitions.vyvza_nazev is 'Původní název souboru výzvy (PDF)';
