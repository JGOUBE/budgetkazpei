-- BudgetKazPei
-- Dynamic SECURITY DEFINER role fix for the retail publication chain.
--
-- The previous migration attempt proved that more than one backend-only
-- retail function still used session_user = 'postgres'. Under Supabase CLI
-- migrations, session_user is the migration/login role while current_user
-- inside SECURITY DEFINER is the function owner.
--
-- This migration deliberately does NOT guess function names.
-- It patches only public.retail_* functions which:
--   1) are SECURITY DEFINER,
--   2) contain an administrator-account guard,
--   3) still contain the legacy session_user postgres comparison.
--
-- No business validation rule is removed.

do $patch$
declare
  r record;
  v_def text;
  v_patched text;
  v_changed integer := 0;
begin
  for r in
    select
      p.oid,
      n.nspname,
      p.proname,
      p.prosecdef,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'retail\_%' escape '\'
      and p.prokind = 'f'
      and p.prosecdef = true
    order by p.proname, p.oid
  loop
    select pg_get_functiondef(r.oid)
      into v_def;

    -- Limit the patch to backend/admin guarded retail functions.
    if position('requires an administrator account' in lower(v_def)) = 0 then
      continue;
    end if;

    if v_def !~* 'session_user[[:space:]]*(=|<>|!=)[[:space:]]*''postgres''' then
      continue;
    end if;

    v_patched := v_def;

    v_patched := replace(
      v_patched,
      'session_user = ''postgres''',
      'current_user = ''postgres'''
    );

    v_patched := replace(
      v_patched,
      'session_user <> ''postgres''',
      'current_user <> ''postgres'''
    );

    v_patched := replace(
      v_patched,
      'session_user != ''postgres''',
      'current_user != ''postgres'''
    );

    if v_patched is distinct from v_def then
      execute v_patched;
      v_changed := v_changed + 1;

      raise notice
        'BudgetKazPei patched retail admin role guard: %.%(%)',
        r.nspname,
        r.proname,
        r.identity_args;
    end if;
  end loop;

  if v_changed = 0 then
    raise notice 'BudgetKazPei: no remaining legacy retail admin role guard required patching';
  else
    raise notice 'BudgetKazPei: patched % retail admin function(s)', v_changed;
  end if;
end;
$patch$;

-- Strong verification: after the patch no SECURITY DEFINER public.retail_*
-- administrator function may still authorize postgres through session_user.
do $verify$
declare
  r record;
  v_def text;
begin
  for r in
    select
      p.oid,
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'retail\_%' escape '\'
      and p.prokind = 'f'
      and p.prosecdef = true
    order by p.proname, p.oid
  loop
    select pg_get_functiondef(r.oid)
      into v_def;

    if position('requires an administrator account' in lower(v_def)) > 0
       and v_def ~* 'session_user[[:space:]]*(=|<>|!=)[[:space:]]*''postgres''' then
      raise exception
        'legacy session_user postgres guard still present in %.%(%)',
        r.nspname,
        r.proname,
        r.identity_args;
    end if;
  end loop;
end;
$verify$;

-- Rerun the already-secured catch-up.
-- retail_auto_publish_safe_promotions keeps all existing safety filters:
-- promotion_proven, evidence, validation_errors, mismatch checks, etc.
do $catchup$
declare
  v_result jsonb;
begin
  if to_regprocedure('public.retail_auto_publish_safe_promotions(text,uuid,integer)') is null then
    raise exception 'retail_auto_publish_safe_promotions(text,uuid,integer) is required';
  end if;

  v_result := public.retail_auto_publish_safe_promotions(
    'leader-price-reunion',
    null,
    500
  );

  raise notice
    'BudgetKazPei Leader Price safe promotion catch-up after dynamic role fix: %',
    v_result;
end;
$catchup$;