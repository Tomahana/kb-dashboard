-- Storage bucket pro přílohy znalostní báze

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kb-knowledge-attachments',
  'kb-knowledge-attachments',
  false,
  15728640,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'message/rfc822',
    'application/vnd.ms-outlook',
    'application/octet-stream',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "kb_knowledge_attachments auth read" on storage.objects;
drop policy if exists "kb_knowledge_attachments auth write" on storage.objects;

create policy "kb_knowledge_attachments auth read"
  on storage.objects for select to authenticated
  using (bucket_id = 'kb-knowledge-attachments');

create policy "kb_knowledge_attachments auth write"
  on storage.objects for all to authenticated
  using (bucket_id = 'kb-knowledge-attachments')
  with check (bucket_id = 'kb-knowledge-attachments');
