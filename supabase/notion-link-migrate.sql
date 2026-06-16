-- Notion propojení u záznamů znalostní báze
alter table if exists public.kb_records add column if not exists notion_link jsonb;

comment on column public.kb_records.notion_link is 'Propojení s Notion stránkou: { pageId, url, title, linkedAt }';

notify pgrst, 'reload schema';
