-- BudgetKazPei
-- Leader Price Reunion - promotions directes fraiches sans dates explicites.
--
-- Le correctif est volontairement cible :
--   * retailer_slug = leader-price-reunion
--   * source_type = leader_drive_html
--   * observation <= 36 h
--   * promotion_proven = true
--   * promotion_evidence presente
--   * original_price > current_price > 0
--
-- Aucune date artificielle n'est creee.
-- Les autres promotions sans dates continuent de tomber en observed_price.

DO $budgetkazpei_patch$
DECLARE
  v_proc regprocedure := to_regprocedure('public.retail_publish_promotion_candidates(uuid[])');
  v_definition text;
  v_patched_definition text;
  v_result jsonb;
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION 'retail_publish_promotion_candidates(uuid[]) is required';
  END IF;

  SELECT pg_get_functiondef(v_proc)
  INTO v_definition;

  -- Idempotence : si le bloc cible est deja installe, on ne recree pas la fonction.
  IF position('BudgetKazPei fresh undated Leader Price direct discount' IN v_definition) > 0 THEN
    RAISE NOTICE 'BudgetKazPei Leader Price fresh-undated patch already installed';
  ELSE
    -- IMPORTANT : on matche la structure logique et non les espaces exacts de
    -- pg_get_functiondef(). C est precisement ce qui faisait echouer la V2.
    v_patched_definition := regexp_replace(
      v_definition,
      $pattern$elsif[[:space:]]+v_candidate\.starts_at[[:space:]]+is[[:space:]]+null[[:space:]]+or[[:space:]]+v_candidate\.ends_at[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+v_fallback_reason[[:space:]]*:=[[:space:]]*'dates_incomplete';[[:space:]]+v_fallback_note[[:space:]]*:=[[:space:]]*'Periode de promotion incomplete - prix conserve comme prix observe\.';$pattern$,
      $replacement$elsif v_candidate.starts_at is null or v_candidate.ends_at is null then
        -- BudgetKazPei fresh undated Leader Price direct discount
        -- Leader Drive peut fournir une remise directe fiable sans periode explicite.
        -- On conserve alors la promotion sans inventer starts_at / ends_at.
        if v_candidate.retailer_slug = 'leader-price-reunion'
           and v_candidate.source_type = 'leader_drive_html'
           and v_candidate.source_observed_at is not null
           and v_candidate.source_observed_at >= now() - interval '36 hours'
           and v_candidate.promotion_proven is true
           and v_candidate.promotion_evidence is not null
           and v_candidate.current_price is not null
           and v_candidate.current_price > 0
           and v_candidate.original_price is not null
           and v_candidate.original_price > v_candidate.current_price then
          v_fallback_reason := null;
          v_fallback_note := null;
        else
          v_fallback_reason := 'dates_incomplete';
          v_fallback_note := 'Periode de promotion incomplete - prix conserve comme prix observe.';
        end if;$replacement$,
      'n'
    );

    IF v_patched_definition IS NULL OR v_patched_definition = v_definition THEN
      RAISE EXCEPTION 'BudgetKazPei V3: bloc dates_incomplete detecte dans le diagnostic mais non remplace par regexp';
    END IF;

    EXECUTE v_patched_definition;

    -- Verification sur la definition reellement recreee.
    SELECT pg_get_functiondef(v_proc)
    INTO v_definition;

    IF position('BudgetKazPei fresh undated Leader Price direct discount' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'BudgetKazPei V3: verification finale du patch echouee';
    END IF;

    RAISE NOTICE 'BudgetKazPei patched retail_publish_promotion_candidates for fresh undated Leader Price promotions';
  END IF;

  -- On tente le rattrapage via la fonction securisee deja installee.
  -- Aucun UPDATE manuel des candidats : on laisse le pipeline existant decider.
  IF to_regprocedure('public.retail_auto_publish_safe_promotions(text,uuid,integer)') IS NOT NULL THEN
    v_result := public.retail_auto_publish_safe_promotions(
      'leader-price-reunion',
      null,
      500
    );
    RAISE NOTICE 'BudgetKazPei Leader Price safe promotion catch-up V3: %', v_result;
  ELSE
    RAISE NOTICE 'BudgetKazPei: auto-publisher absent, patch fonction applique sans rattrapage';
  END IF;
END;
$budgetkazpei_patch$;