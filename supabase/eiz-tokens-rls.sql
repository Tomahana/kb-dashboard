-- RLS pro EIZ tokeny — spusťte po eiz-tokens-schema.sql

alter table if exists public.kb_eiz_contracts enable row level security;
alter table if exists public.kb_eiz_contract_years enable row level security;
alter table if exists public.kb_eiz_publications enable row level security;

drop policy if exists "kb_eiz_contracts authenticated read" on public.kb_eiz_contracts;
drop policy if exists "kb_eiz_contracts authenticated write" on public.kb_eiz_contracts;
drop policy if exists "kb_eiz_contract_years authenticated read" on public.kb_eiz_contract_years;
drop policy if exists "kb_eiz_contract_years authenticated write" on public.kb_eiz_contract_years;
drop policy if exists "kb_eiz_publications authenticated read" on public.kb_eiz_publications;
drop policy if exists "kb_eiz_publications authenticated write" on public.kb_eiz_publications;

create policy "kb_eiz_contracts authenticated read"
  on public.kb_eiz_contracts for select to authenticated using (true);
create policy "kb_eiz_contracts authenticated write"
  on public.kb_eiz_contracts for all to authenticated using (true) with check (true);

create policy "kb_eiz_contract_years authenticated read"
  on public.kb_eiz_contract_years for select to authenticated using (true);
create policy "kb_eiz_contract_years authenticated write"
  on public.kb_eiz_contract_years for all to authenticated using (true) with check (true);

create policy "kb_eiz_publications authenticated read"
  on public.kb_eiz_publications for select to authenticated using (true);
create policy "kb_eiz_publications authenticated write"
  on public.kb_eiz_publications for all to authenticated using (true) with check (true);

revoke all on public.kb_eiz_contracts from anon;
revoke all on public.kb_eiz_contract_years from anon;
revoke all on public.kb_eiz_publications from anon;

grant select, insert, update, delete on public.kb_eiz_contracts to authenticated;
grant select, insert, update, delete on public.kb_eiz_contract_years to authenticated;
grant select, insert, update, delete on public.kb_eiz_publications to authenticated;
