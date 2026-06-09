-- Prestige – rozšíření přihlášek o sloupce cílové soutěže, termín, rozpočty a hodnocení K1–K7

alter table public.kb_competition_applications add column if not exists cilova_soutez text;
alter table public.kb_competition_applications add column if not exists termin_podani text;
alter table public.kb_competition_applications add column if not exists rozpocet_rok_2 numeric(14, 2);
alter table public.kb_competition_applications add column if not exists hodnoceni_prumer numeric(10, 4);
alter table public.kb_competition_applications add column if not exists rozhodnuti_poradi integer;
alter table public.kb_competition_applications add column if not exists hodnoceni_kriteria jsonb;

comment on column public.kb_competition_applications.cilova_soutez is 'Cílová prestižní soutěž (ERC, Horizon Europe, …)';
comment on column public.kb_competition_applications.termin_podani is 'Předpokládaný termín podání návrhu';
comment on column public.kb_competition_applications.rozpocet_rok_2 is 'Rozpočet 2. rok (Kč); rok 1 = financni_pozadavek';
comment on column public.kb_competition_applications.hodnoceni_kriteria is 'Skóre K1–K7 jako JSON {"k1":1,"k2":2,...}';

create index if not exists kb_comp_app_cilova_soutez_idx on public.kb_competition_applications (cilova_soutez);
