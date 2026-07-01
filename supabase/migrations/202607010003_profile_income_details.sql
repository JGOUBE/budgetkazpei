alter table public.profiles
  add column if not exists revenus_details jsonb default '{}'::jsonb;
