-- Propojení Document Intelligence → modul Témata (kb_topics + kb_topic_records)
-- Spusťte v Supabase SQL Editoru po topics-schema.sql

alter table public.kb_topic_records
  add column if not exists source text default 'kb_records',
  add column if not exists source_id text;

comment on column public.kb_topic_records.source is 'Zdroj vazby: kb_records, doc-intelligence, …';
comment on column public.kb_topic_records.source_id is 'ID záznamu ve zdrojovém modulu';

create index if not exists kb_topic_records_source_idx
  on public.kb_topic_records (source, source_id);

create unique index if not exists kb_topic_records_topic_source_uidx
  on public.kb_topic_records (topic_id, source, source_id)
  where source_id is not null;
