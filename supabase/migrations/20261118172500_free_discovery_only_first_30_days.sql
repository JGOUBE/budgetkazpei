-- The free tier can scan up to three receipts in the first thirty days,
-- counted across month boundaries by the reservation/status functions.
-- After this period the scanner is a Premium benefit; manual entry stays free.
-- Paid legacy tiers continue to share the same hidden protection.
create or replace function public.receipt_scan_plan_limit(p_plan text)
returns integer
language sql immutable
as $function$
  select case when p_plan in ('premium','premium_plus') then 100 else 0 end
$function$;
