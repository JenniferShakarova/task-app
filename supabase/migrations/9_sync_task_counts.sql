-- Function to sync task counts with actual task data
-- This fixes any discrepancies between usage_tracking and actual task counts
create or replace function sync_task_counts()
returns void
security definer
set search_path = public
as $$
declare
  current_month text;
begin
  current_month := to_char(NOW(), 'YYYY-MM');
  
  -- Delete existing usage_tracking entries for current month
  -- We'll recalculate them from actual tasks
  delete from public.usage_tracking
  where year_month = current_month;
  
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
  
  -- Also handle any tasks that were created but then deleted
  -- This ensures counts are accurate even after deletions
  update public.usage_tracking ut
  set tasks_created = (
    select count(*)
    from public.tasks t
    where t.user_id = ut.user_id
      and to_char(t.created_at, 'YYYY-MM') = ut.year_month
  )
  where ut.year_month = current_month;
end;
$$ language plpgsql;

-- Run the sync function to fix any existing discrepancies
select sync_task_counts();

-- Drop the temporary sync function (we don't need it anymore)
drop function if exists sync_task_counts();









