-- Oprava check constraint kb_items_status_check
-- Spusťte v Supabase SQL Editoru, pokud ukládání hlásí porušení kb_items_status_check

update public.kb_items
set status = 'archived'
where status in ('closed', 'cancelled', 'canceled');

update public.kb_items
set status = 'done'
where status in ('complete', 'completed', 'resolved');

update public.kb_items
set status = 'in_progress'
where status in ('in progress', 'in-progress', 'progress');

update public.kb_items
set status = 'open'
where status is null
   or status not in ('open', 'in_progress', 'done', 'archived');

alter table public.kb_items drop constraint if exists kb_items_status_check;

alter table public.kb_items add constraint kb_items_status_check
  check (status in ('open', 'in_progress', 'done', 'archived'));

comment on constraint kb_items_status_check on public.kb_items is
  'Povolené stavy KB záznamu — sjednoceno s dashboardem';
