-- Storage bucket pro PDF pokynů a výzev interních soutěží
-- Spusťte po competitions-schema.sql (a migrate-pdf.sql pokud tabulka už existuje)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kb-competition-docs',
  'kb-competition-docs',
  true,
  15728640,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kb_competition_docs authenticated read" on storage.objects;
drop policy if exists "kb_competition_docs authenticated write" on storage.objects;
drop policy if exists "kb_competition_docs anon read" on storage.objects;

create policy "kb_competition_docs authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'kb-competition-docs');

create policy "kb_competition_docs authenticated write"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'kb-competition-docs')
  with check (bucket_id = 'kb-competition-docs');
