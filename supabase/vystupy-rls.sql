-- RLS pro modul Výstupy — spusťte po vystupy-schema.sql

alter table if exists public.kb_vystupy_jimp enable row level security;
alter table if exists public.kb_vystupy_jsc enable row level security;
alter table if exists public.kb_vystupy_b enable row level security;
alter table if exists public.kb_vystupy_c enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['kb_vystupy_jimp', 'kb_vystupy_jsc', 'kb_vystupy_b', 'kb_vystupy_c']
  loop
    execute format('drop policy if exists "%s authenticated read" on public.%I', t, t);
    execute format('drop policy if exists "%s authenticated write" on public.%I', t, t);
    execute format(
      'create policy "%s authenticated read" on public.%I for select to authenticated using (true)',
      t, t
    );
    execute format(
      'create policy "%s authenticated write" on public.%I for all to authenticated using (true) with check (true)',
      t, t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
