-- Run this SQL in your Supabase SQL Editor to fix task counting issues

-- 1. Improve the decrement function
create or replace function decrement_task_count() 
returns trigger
security definer
set search_path = public
as $$
declare
  task_month text;
begin
  -- Get the month when the task was created
  task_month := to_char(OLD.created_at, 'YYYY-MM');
  
  -- Decrement the task count for the month the task was created in
  -- Use upsert to handle case where record might not exist
  insert into public.usage_tracking (user_id, year_month, tasks_created)
  values (OLD.user_id, task_month, 0)
  on conflict (user_id, year_month)
  do update set tasks_created = greatest(0, usage_tracking.tasks_created - 1);
  
  return OLD;
end;
$$ language plpgsql;

-- 2. Sync current month's task counts with actual tasks
do $$
declare
  current_month text;
begin
  current_month := to_char(NOW(), 'YYYY-MM');
  
  -- Recalculate task counts from actual tasks for current month
  insert into public.usage_tracking (user_id, year_month, tasks_created)
  select 
    user_id,
    to_char(created_at, 'YYYY-MM') as year_month,
    count(*) as tasks_created
  from public.tasks
  where to_char(created_at, 'YYYY-MM') = current_month
  group by user_id, to_char(created_at, 'YYYY-MM')
  on conflict (user_id, year_month)
  do update set tasks_created = excluded.tasks_created;
  
  -- Update counts to match actual task counts (handles deletions)
  update public.usage_tracking ut
  set tasks_created = (
    select count(*)
    from public.tasks t
    where t.user_id = ut.user_id
      and to_char(t.created_at, 'YYYY-MM') = ut.year_month
  )
  where ut.year_month = current_month;
end $$;

-- 3. Verify the counts (run this to see current state)
-- Uncomment to see your current task counts:
-- SELECT 
--   ut.user_id,
--   ut.year_month,
--   ut.tasks_created as tracked_count,
--   (SELECT count(*) FROM tasks t WHERE t.user_id = ut.user_id AND to_char(t.created_at, 'YYYY-MM') = ut.year_month) as actual_count
-- FROM usage_tracking ut
-- WHERE ut.year_month = to_char(NOW(), 'YYYY-MM');









