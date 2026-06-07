-- Ověření, že schéma témat funguje.
-- Spusťte po topics-schema.sql v Supabase SQL Editoru.

-- Tabulky existují?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('kb_topics', 'kb_topic_records');

-- Test zápisu a čtení (ukázkové téma – po ověření smažte, pokud nechcete)
insert into public.kb_topics (name, description)
values ('Test téma KB', 'Dočasný test po nasazení schématu')
returning id, name, created_at;

-- Po spuštění výše zkopírujte vrácené id a případně otestujte vazbu:
-- insert into public.kb_topic_records (topic_id, kb_id)
-- values ('<UUID-z-předchozího-insertu>', '<KB_ID-z-kb_records>');

-- Přehled témat
select
  t.id,
  t.name,
  t.agenda,
  left(coalesce(t.ai_summary, ''), 80) as ai_summary_preview,
  count(r.kb_id) as email_count,
  t.updated_at
from public.kb_topics t
left join public.kb_topic_records r on r.topic_id = t.id
group by t.id
order by t.updated_at desc;
