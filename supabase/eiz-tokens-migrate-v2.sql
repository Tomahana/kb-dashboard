-- Migrace EIZ tokenů v2 — neomezené tokeny, smlouvy se slevou na APC
-- Spusťte po eiz-tokens-schema.sql na existující databázi.

alter table if exists public.kb_eiz_contracts
  add column if not exists typ_cerpani text not null default 'tokeny';

alter table if exists public.kb_eiz_contracts
  add column if not exists sleva_apc_procent numeric(5, 2);

alter table if exists public.kb_eiz_contract_years
  add column if not exists neomezene boolean not null default false;

alter table if exists public.kb_eiz_contract_years
  alter column pocet_tokenu drop not null;

alter table if exists public.kb_eiz_contract_years
  drop constraint if exists kb_eiz_contract_years_pocet_tokenu_check;

alter table if exists public.kb_eiz_contract_years
  add constraint kb_eiz_contract_years_pocet_tokenu_check
  check (pocet_tokenu is null or pocet_tokenu >= 0);

alter table if exists public.kb_eiz_contracts
  drop constraint if exists kb_eiz_contracts_typ_cerpani_check;

alter table if exists public.kb_eiz_contracts
  add constraint kb_eiz_contracts_typ_cerpani_check
  check (typ_cerpani in ('tokeny', 'sleva_apc'));

comment on column public.kb_eiz_contracts.typ_cerpani is 'tokeny = čerpání tokenů; sleva_apc = sleva na APC bez počítání tokenů';
comment on column public.kb_eiz_contracts.sleva_apc_procent is 'Výše slevy na APC (např. 20 = 20 %) u typu sleva_apc';
comment on column public.kb_eiz_contract_years.neomezene is 'Neomezený počet tokenů v daném roce';

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('kb_eiz_contracts', 'kb_eiz_contract_years')
  and column_name in ('typ_cerpani', 'sleva_apc_procent', 'neomezene')
order by table_name, column_name;
