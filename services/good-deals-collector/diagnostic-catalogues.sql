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

-- 4. Rendement par source (30 derniers jours, sans nouvelle collecte).
-- Attention: les candidats sont des lignes courantes (une publication ancienne
-- peut rester publiee) ; ce bilan est un indicateur, pas un journal comptable.
with snap as (
    select source_slug,
           count(*) as executions_source,
           count(*) filter (where processing_status = 'failed') as erreurs_source,
           count(*) filter (where processing_status = 'skipped_unchanged') as sans_changement,
           max(checked_at) as derniere_verification
    from public.good_deal_source_snapshots
    where checked_at >= now() - interval '30 days'
    group by source_slug
),
cand as (
    select s.slug as source_slug,
           count(*) filter (where c.status = 'published') as candidats_publies,
           count(*) filter (where c.status = 'duplicate') as candidats_doublons,
           count(*) filter (where c.status = 'needs_review') as candidats_a_verifier
    from public.good_deal_candidates c
    join public.good_deal_sources s on s.id = c.source_id
    where c.created_at >= now() - interval '30 days'
    group by s.slug
)
select s.name, s.slug, s.content_family, s.is_active,
       coalesce(snap.executions_source, 0) as verifications_30j,
       coalesce(snap.erreurs_source, 0) as erreurs_30j,
       coalesce(snap.sans_changement, 0) as sans_changement_30j,
       coalesce(cand.candidats_publies, 0) as publications_30j,
       coalesce(cand.candidats_doublons, 0) as doublons_30j,
       coalesce(cand.candidats_a_verifier, 0) as a_verifier_30j,
       snap.derniere_verification
from public.good_deal_sources s
left join snap on snap.source_slug = s.slug
left join cand on cand.source_slug = s.slug
order by s.content_family, s.slug;

-- Recommandation opérationnelle : ne pas réactiver une source qui échoue
-- régulièrement, tant que son parseur n'a pas passé les tests locaux.
-- Aucun UPDATE de statut ni aucune collecte ne sont effectués ici.
