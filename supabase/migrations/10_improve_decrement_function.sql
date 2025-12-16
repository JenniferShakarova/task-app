-- Improve the decrement function to handle edge cases better
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









