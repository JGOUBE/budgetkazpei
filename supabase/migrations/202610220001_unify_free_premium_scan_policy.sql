-- Unify the public commercial model to Free / Premium while preserving
-- compatibility with historical premium_plus values already stored.
-- This migration is intentionally non-destructive: no subscription row is rewritten.

create or replace function public.receipt_scan_plan_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case
    when public.receipt_scan_normalize_plan(p_plan) = 'premium' then 50
    else 1
  end
$$;

create or replace function public.receipt_scan_limit_reason(p_plan text)
returns text
language sql
immutable
as $$
  select case
    when public.receipt_scan_normalize_plan(p_plan) = 'premium' then 'scan_safety_limit_reached'
    else 'monthly_quota_reached'
  end
$$;

create or replace function public.receipt_scan_normalize_plan(p_plan text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_plan, ''))) in (
      'premium',
      'premium_plus',
      'premium+',
      'premium plus',
      'premium-plus'
    ) then 'premium'
    else 'free'
  end
$$;

comment on function public.receipt_scan_plan_limit(text) is
  'Operational anti-abuse limit for receipt scanning. Premium limit is internal and not a commercial quota.';

comment on function public.receipt_scan_normalize_plan(text) is
  'Canonicalizes historical premium_plus values to the single Premium entitlement.';
