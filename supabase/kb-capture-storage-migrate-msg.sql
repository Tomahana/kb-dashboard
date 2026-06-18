-- Povolit nahrávání .msg a dalších souborů s MIME application/octet-stream
-- Spusťte v Supabase SQL Editoru, pokud upload příloh hlásí:
--   mime type application/octet-stream is not supported

update storage.buckets
set allowed_mime_types = array[
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
where id = 'kb-knowledge-attachments';

select id, allowed_mime_types
from storage.buckets
where id = 'kb-knowledge-attachments';
