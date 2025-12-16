-- Enable Stripe integration
-- Note: Stripe customer creation/deletion is handled via edge functions
-- The foreign data wrapper approach is not available in standard Supabase

-- Function to handle Stripe customer creation
-- This is a placeholder - actual customer creation happens via edge functions
create or replace function public.handle_stripe_customer_creation()
returns trigger
security definer
set search_path = public
as $$
begin
  -- Stripe customer creation is handled via edge functions
  -- This trigger is kept for future use but doesn't create customers directly
  return new;
end;
$$ language plpgsql;

-- Trigger to create Stripe customer on profile creation
-- Note: Currently disabled as customer creation is handled via edge functions
-- create trigger create_stripe_customer_on_profile_creation
--   before insert on public.profiles
--   for each row
--   execute function public.handle_stripe_customer_creation();

-- Function to handle Stripe customer deletion
-- This is a placeholder - actual customer deletion happens via edge functions
create or replace function public.handle_stripe_customer_deletion()
returns trigger
security definer
set search_path = public
as $$
begin
  -- Stripe customer deletion is handled via edge functions
  -- This trigger is kept for future use but doesn't delete customers directly
  return old;
end;
$$ language plpgsql;

-- Trigger to delete Stripe customer on profile deletion
-- Note: Currently disabled as customer deletion is handled via edge functions
-- create trigger delete_stripe_customer_on_profile_deletion
--   before delete on public.profiles
--   for each row
--   execute function public.handle_stripe_customer_deletion();

-- Security policy: Users can read their own Stripe data
create policy "Users can read own Stripe data"
  on public.profiles
  for select
  using (auth.uid() = user_id);