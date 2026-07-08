-- Storage bucket pro Article Factory (PDF rukopisy, vlastní publikace)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kb-article-attachments',
  'kb-article-attachments',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/csv'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
