-- Link an existing paid checkout to an authenticated account only when the
-- Supabase identity has a verified email exactly matching the Stripe checkout.
-- Never accept an email parameter from the caller.
create or replace function public.claim_budgetkazpei_stripe_subscription()
returns integer
language plpgsql security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_count integer := 0;
begin
  if v_user is null then return 0; end if;
  select lower(trim(email)) into v_email from auth.users
  where id=v_user and email_confirmed_at is not null;
  if v_email is null or v_email='' then return 0; end if;
  update public.user_subscriptions
    set user_id=v_user, updated_at=now()
    where user_id is null
      and lower(trim(email))=v_email
      and status in ('active','trialing')
      and (billing_source is null or billing_source='stripe');
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;
revoke all on function public.claim_budgetkazpei_stripe_subscription() from public, anon;
grant execute on function public.claim_budgetkazpei_stripe_subscription() to authenticated;
