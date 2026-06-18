-- =============================================================================
-- RLS pro modul Výstupy — spusťte PO vystupy-schema.sql
-- =============================================================================
-- Pokud tabulky neexistují, skript je přeskočí a vypíše upozornění.
-- Nejdříve musí existovat kb_persons (persons-schema.sql) a tabulky kb_vystupy_*.
-- =============================================================================

do $$
declare
  t text;
  tables text[] := array['kb_vystupy_jimp', 'kb_vystupy_jsc', 'kb_vystupy_b', 'kb_vystupy_c'];
  missing int := 0;
begin
  foreach t in array tables
  loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      missing := missing + 1;
      raise notice 'Tabulka public.% neexistuje — RLS přeskočeno. Spusťte nejdříve supabase/vystupy-schema.sql.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
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
    raise notice 'RLS nastaveno pro public.%', t;
  end loop;

  if missing = array_length(tables, 1) then
    raise exception 'Žádná tabulka kb_vystupy_* neexistuje. Spusťte supabase/vystupy-schema.sql (po persons-schema.sql).';
  end if;
end $$;
