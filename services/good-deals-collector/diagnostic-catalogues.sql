-- BudgetKazPei : audit en lecture seule, aucun appel Cloud Run.
-- Executer dans SQL Editor du projet Supabase KazBudgetPei uniquement.
-- Les vues de publication filtrent les catalogues expirés et futurs.

-- 1. Rendement des 15 dernieres executions.
select started_at, status, sources_checked, sources_changed,
       candidates_detected, candidates_published, duplicates_detected,
       errors_count, error_summary
from public.good_deal_ingestion_runs
order by started_at desc
limit 15;

-- 2. Fiabilite des sources sur les 30 derniers jours.
select source_slug,
       count(*) as controles,
       count(*) filter (where processing_status = 'failed') as echecs,
       count(*) filter (where changed is true) as changements,
       max(checked_at) as dernier_controle
from public.good_deal_source_snapshots
where checked_at >= now() - interval '30 days'
group by source_slug
order by echecs desc, source_slug;

-- 3. Repartition catalogue (stock conserve, affichage seulement si valide).
select retailer_name,
       count(*) as catalogues_historiques,
       count(*) filter (
           where is_active is true
             and verification_status = 'published'
             and starts_at <= now()
             and ends_at >= now()
       ) as catalogues_visibles_maintenant,
       count(*) filter (
           where is_active is true
             and verification_status = 'published'
             and starts_at > now()
       ) as catalogues_a_venir,
       max(created_at) as dernier_ajout
from public.shopping_catalogs
group by retailer_name
order by catalogues_visibles_maintenant desc, retailer_name;
