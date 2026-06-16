-- Migrace dat z jednotné kb_competitions do tabulek Connect, Prestige, ReGa, Horizon
-- Spusťte až po supabase/competitions-program-tables.sql
-- Návraty a PhD Seed zůstávají v kb_competitions (legacy)

-- ---------------------------------------------------------------------------
-- Doplnění sloupců v legacy tabulkách (pokud chybí z dřívějších migrací)
-- ---------------------------------------------------------------------------
alter table public.kb_competitions add column if not exists pokyn text;
alter table public.kb_competitions add column if not exists pokyn_nazev text;
alter table public.kb_competitions add column if not exists vyvza text;
alter table public.kb_competitions add column if not exists vyvza_nazev text;

alter table public.kb_competition_applications add column if not exists projekt_id text;
alter table public.kb_competition_applications add column if not exists katedra text;
alter table public.kb_competition_applications add column if not exists hodnoceni_komise text;
alter table public.kb_competition_applications add column if not exists resitel_id uuid;
alter table public.kb_competition_applications add column if not exists castka_alokovana numeric(14, 2);
alter table public.kb_competition_applications add column if not exists cilova_soutez text;
alter table public.kb_competition_applications add column if not exists termin_podani text;
alter table public.kb_competition_applications add column if not exists rozpocet_rok_2 numeric(14, 2);
alter table public.kb_competition_applications add column if not exists hodnoceni_prumer numeric(10, 4);
alter table public.kb_competition_applications add column if not exists rozhodnuti_poradi integer;
alter table public.kb_competition_applications add column if not exists hodnoceni_kriteria jsonb;

alter table public.kb_competition_supported add column if not exists projekt_id text;
alter table public.kb_competition_supported add column if not exists katedra text;
alter table public.kb_competition_supported add column if not exists resitel_id uuid;

-- Connect
insert into public.kb_competition_connect (
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
)
select
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
from public.kb_competitions
where program_slug = 'connect'
on conflict (id) do update set
  nazev = excluded.nazev,
  rok = excluded.rok,
  beh_cislo = excluded.beh_cislo,
  alokovana_castka = excluded.alokovana_castka,
  updated_at = excluded.updated_at;

insert into public.kb_competition_connect_applications (
  id, competition_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, financni_pozadavek, castka_alokovana, hodnoceni, hodnoceni_komise, stav, poznamka, created_at
)
select
  a.id, a.competition_id, a.projekt_id, a.nazev_projektu, a.resitel_id, a.resitel_osobni_cislo, a.resitel,
  a.fakulta, a.katedra, a.financni_pozadavek, a.castka_alokovana, a.hodnoceni, a.hodnoceni_komise, a.stav, a.poznamka, a.created_at
from public.kb_competition_applications a
join public.kb_competitions c on c.id = a.competition_id
where c.program_slug = 'connect'
on conflict (id) do nothing;

insert into public.kb_competition_connect_supported (
  id, competition_id, application_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, castka_podpory, poznamka, created_at
)
select
  s.id, s.competition_id, s.application_id, s.projekt_id, s.nazev_projektu, s.resitel_id, s.resitel_osobni_cislo, s.resitel,
  s.fakulta, s.katedra, s.castka_podpory, s.poznamka, s.created_at
from public.kb_competition_supported s
join public.kb_competitions c on c.id = s.competition_id
where c.program_slug = 'connect'
on conflict (id) do nothing;

-- Prestige
insert into public.kb_competition_prestige (
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
)
select
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
from public.kb_competitions
where program_slug = 'prestige'
on conflict (id) do update set
  nazev = excluded.nazev,
  rok = excluded.rok,
  updated_at = excluded.updated_at;

insert into public.kb_competition_prestige_applications (
  id, competition_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, financni_pozadavek, hodnoceni, hodnoceni_komise, stav, poznamka,
  cilova_soutez, termin_podani, rozpocet_rok_2, hodnoceni_prumer, rozhodnuti_poradi, hodnoceni_kriteria, created_at
)
select
  a.id, a.competition_id, a.projekt_id, a.nazev_projektu, a.resitel_id, a.resitel_osobni_cislo, a.resitel,
  a.fakulta, a.katedra, a.financni_pozadavek, a.hodnoceni, a.hodnoceni_komise, a.stav, a.poznamka,
  a.cilova_soutez, a.termin_podani, a.rozpocet_rok_2, a.hodnoceni_prumer, a.rozhodnuti_poradi, a.hodnoceni_kriteria, a.created_at
from public.kb_competition_applications a
join public.kb_competitions c on c.id = a.competition_id
where c.program_slug = 'prestige'
on conflict (id) do nothing;

insert into public.kb_competition_prestige_supported (
  id, competition_id, application_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, castka_podpory, poznamka, created_at
)
select
  s.id, s.competition_id, s.application_id, s.projekt_id, s.nazev_projektu, s.resitel_id, s.resitel_osobni_cislo, s.resitel,
  s.fakulta, s.katedra, s.castka_podpory, s.poznamka, s.created_at
from public.kb_competition_supported s
join public.kb_competitions c on c.id = s.competition_id
where c.program_slug = 'prestige'
on conflict (id) do nothing;

-- ReGa
insert into public.kb_competition_rega (
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
)
select
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
from public.kb_competitions
where program_slug = 'rega'
on conflict (id) do update set
  nazev = excluded.nazev,
  rok = excluded.rok,
  updated_at = excluded.updated_at;

insert into public.kb_competition_rega_applications (
  id, competition_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, financni_pozadavek, hodnoceni, hodnoceni_komise, stav, poznamka, created_at
)
select
  a.id, a.competition_id, a.projekt_id, a.nazev_projektu, a.resitel_id, a.resitel_osobni_cislo, a.resitel,
  a.fakulta, a.katedra, a.financni_pozadavek, a.hodnoceni, a.hodnoceni_komise, a.stav, a.poznamka, a.created_at
from public.kb_competition_applications a
join public.kb_competitions c on c.id = a.competition_id
where c.program_slug = 'rega'
on conflict (id) do nothing;

insert into public.kb_competition_rega_supported (
  id, competition_id, application_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, castka_podpory, poznamka, created_at
)
select
  s.id, s.competition_id, s.application_id, s.projekt_id, s.nazev_projektu, s.resitel_id, s.resitel_osobni_cislo, s.resitel,
  s.fakulta, s.katedra, s.castka_podpory, s.poznamka, s.created_at
from public.kb_competition_supported s
join public.kb_competitions c on c.id = s.competition_id
where c.program_slug = 'rega'
on conflict (id) do nothing;

-- Horizon No-Cost
insert into public.kb_competition_horizon (
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
)
select
  id, nazev, rok, beh_cislo, alokovana_castka, pokyn, pokyn_nazev, vyvza, vyvza_nazev,
  pocet_prihlasek, hodnoceni_prodekanu, rozhodnuti_prorektorky, poznamka, stav, created_at, updated_at
from public.kb_competitions
where program_slug = 'horizon'
on conflict (id) do update set
  nazev = excluded.nazev,
  rok = excluded.rok,
  updated_at = excluded.updated_at;

insert into public.kb_competition_horizon_applications (
  id, competition_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, financni_pozadavek, hodnoceni, hodnoceni_komise, stav, poznamka, created_at
)
select
  a.id, a.competition_id, a.projekt_id, a.nazev_projektu, a.resitel_id, a.resitel_osobni_cislo, a.resitel,
  a.fakulta, a.katedra, a.financni_pozadavek, a.hodnoceni, a.hodnoceni_komise, a.stav, a.poznamka, a.created_at
from public.kb_competition_applications a
join public.kb_competitions c on c.id = a.competition_id
where c.program_slug = 'horizon'
on conflict (id) do nothing;

insert into public.kb_competition_horizon_supported (
  id, competition_id, application_id, projekt_id, nazev_projektu, resitel_id, resitel_osobni_cislo, resitel,
  fakulta, katedra, castka_podpory, poznamka, created_at
)
select
  s.id, s.competition_id, s.application_id, s.projekt_id, s.nazev_projektu, s.resitel_id, s.resitel_osobni_cislo, s.resitel,
  s.fakulta, s.katedra, s.castka_podpory, s.poznamka, s.created_at
from public.kb_competition_supported s
join public.kb_competitions c on c.id = s.competition_id
where c.program_slug = 'horizon'
on conflict (id) do nothing;

-- Odstranit migrované záznamy z legacy tabulek (volitelné – ponechává Návraty / PhD Seed)
delete from public.kb_competition_supported s
using public.kb_competitions c
where s.competition_id = c.id
  and c.program_slug in ('connect', 'prestige', 'rega', 'horizon');

delete from public.kb_competition_applications a
using public.kb_competitions c
where a.competition_id = c.id
  and c.program_slug in ('connect', 'prestige', 'rega', 'horizon');

delete from public.kb_competitions
where program_slug in ('connect', 'prestige', 'rega', 'horizon');

notify pgrst, 'reload schema';

select 'connect' as program, count(*) as behu from public.kb_competition_connect
union all select 'prestige', count(*) from public.kb_competition_prestige
union all select 'rega', count(*) from public.kb_competition_rega
union all select 'horizon', count(*) from public.kb_competition_horizon
union all select 'legacy', count(*) from public.kb_competitions;
