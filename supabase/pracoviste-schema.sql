-- Číselník pracovišť UHK — hierarchická organizační struktura (kodorg, název, rodič).
-- Slouží k identifikaci pracovišť v modulech Osoby, Rady a orgány a dalších agendách.
--
-- Import: CSV/TSV → kb_pracoviste_import → spusťte pracoviste-import-from-staging.sql
-- Vzor: data/pracoviste-import.example.tsv

create table if not exists public.kb_pracoviste (
  kodorg text primary key,
  nazev text not null,
  kodorg_rodic text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_pracoviste_rodic_fk
    foreign key (kodorg_rodic) references public.kb_pracoviste (kodorg)
    on delete set null
    deferrable initially deferred
);

create index if not exists kb_pracoviste_rodic_idx on public.kb_pracoviste (kodorg_rodic);
create index if not exists kb_pracoviste_nazev_idx on public.kb_pracoviste (nazev);
create index if not exists kb_pracoviste_nazev_lower_idx on public.kb_pracoviste (lower(nazev));

comment on table public.kb_pracoviste is 'Organizační struktura UHK — číselník pracovišť podle kodorg (IS / evidence UHK)';
comment on column public.kb_pracoviste.kodorg is 'Kód organizační jednotky (text — zachovat úvodní nuly, např. 09926, 03250)';
comment on column public.kb_pracoviste.nazev is 'Název pracoviště (katedra, fakulta, oddělení, ústav…)';
comment on column public.kb_pracoviste.kodorg_rodic is 'Kód nadřazené jednotky; NULL nebo 0 = kořen / univerzita';

-- Kořen stromu (pokud v importu chybí)
insert into public.kb_pracoviste (kodorg, nazev, kodorg_rodic)
values ('0', 'Univerzita Hradec Králové', null)
on conflict (kodorg) do update set
  nazev = excluded.nazev,
  updated_at = now();

create or replace function public.kb_pracoviste_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists kb_pracoviste_updated_at_trg on public.kb_pracoviste;
create trigger kb_pracoviste_updated_at_trg
  before update on public.kb_pracoviste for each row
  execute function public.kb_pracoviste_set_updated_at();

-- Plná cesta pracoviště (pro vyhledávání a zobrazení)
create or replace function public.kb_pracoviste_cesta(p_kodorg text)
returns text language sql stable as $$
  with recursive chain as (
    select kodorg, nazev, kodorg_rodic, nazev::text as cesta, 0 as uroven
    from public.kb_pracoviste
    where kodorg = nullif(trim(p_kodorg), '')
    union all
    select p.kodorg, p.nazev, p.kodorg_rodic,
      p.nazev || ' › ' || c.cesta,
      c.uroven + 1
    from chain c
    join public.kb_pracoviste p on p.kodorg = c.kodorg_rodic
    where c.kodorg_rodic is not null
      and c.uroven < 20
  )
  select cesta from chain order by uroven desc limit 1;
$$;

comment on function public.kb_pracoviste_cesta is 'Složená cesta od listu ke kořeni, např. „Katedra informatiky › FIM › UHK“';

create or replace view public.kb_pracoviste_prehled as
select
  p.kodorg,
  p.nazev,
  p.kodorg_rodic,
  r.nazev as nazev_rodic,
  public.kb_pracoviste_cesta(p.kodorg) as cesta,
  p.updated_at
from public.kb_pracoviste p
left join public.kb_pracoviste r on r.kodorg = p.kodorg_rodic;

comment on view public.kb_pracoviste_prehled is 'Přehled pracovišť s názvem rodiče a plnou cestou';

grant select on public.kb_pracoviste to anon, authenticated;
grant insert, update, delete on public.kb_pracoviste to authenticated;
grant execute on function public.kb_pracoviste_cesta(text) to anon, authenticated;
grant select on public.kb_pracoviste_prehled to anon, authenticated;

alter table public.kb_pracoviste enable row level security;

drop policy if exists "kb_pracoviste auth read" on public.kb_pracoviste;
create policy "kb_pracoviste auth read" on public.kb_pracoviste
  for select to authenticated using (true);

drop policy if exists "kb_pracoviste auth write" on public.kb_pracoviste;
create policy "kb_pracoviste auth write" on public.kb_pracoviste
  for all to authenticated using (true) with check (true);
