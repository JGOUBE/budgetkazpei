-- 22/11/2026 - correction de 12 seuils forfaitaires non réglementaires.
-- Valeurs précédentes, enregistrées pour audit (IDs 1..12):
-- [5000,2500,2500,1800,3500,5000,3000,3000,3000,3000,2500,3000].
-- Aucun de ces seuils numériques ne peut décider seul d'un droit.
-- Seuls les liens de source effectivement consultés sont datés.
BEGIN;
UPDATE public.aides_reunion
SET revenus_max = NULL,
  description_fr = CASE id
    WHEN 1 THEN 'Aide personnelle au logement calculée selon les ressources, le loyer, la composition du foyer et les caractéristiques du logement. Le revenu mensuel ne suffit pas à déterminer le droit.'
    WHEN 2 THEN 'Complément de revenus d activité sous conditions, calculé en tenant compte des ressources et de la composition du foyer. Le droit doit être simulé auprès de la CAF.'
    WHEN 3 THEN 'Chèque énergie 2026 attribué selon notamment le revenu fiscal de référence par unité de consommation (RFR/UC), et non un seuil mensuel fixe. Montant 2026 indicatif selon barème officiel.'
    WHEN 4 THEN 'RSA calculé en fonction de la composition du foyer et des ressources retenues. Une somme mensuelle unique ne permet pas de conclure à l éligibilité.'
    WHEN 5 THEN 'Allocation de rentrée scolaire sous conditions de ressources, notamment selon le nombre d enfants à charge et les règles de la campagne concernée.'
    WHEN 6 THEN 'Complément de libre choix du mode de garde (CMG) selon la situation familiale, les ressources, l âge de l enfant, le mode de garde et les dépenses ; faire une simulation CAF.'
    ELSE description_fr
  END,
  description = CASE WHEN id IN (1,2,3,4,5,6)
    THEN CASE id
      WHEN 1 THEN 'Aide au logement calculée selon l ensemble de la situation du foyer ; simuler sur le site CAF.'
      WHEN 2 THEN 'Prime activité : montant selon ressources et composition du foyer ; simulation CAF.'
      WHEN 3 THEN 'Chèque énergie 2026 : barème basé sur le RFR par unité de consommation.'
      WHEN 4 THEN 'RSA : montant selon les ressources et la composition du foyer.'
      WHEN 5 THEN 'Allocation de rentrée scolaire : plafonds selon composition familiale et année.'
      WHEN 6 THEN 'CMG : aide de garde d enfants dépendant du mode de garde et de la famille.'
    END
    ELSE description END,
  statut_verification = CASE WHEN id BETWEEN 1 AND 6 THEN 'source_confirmee' ELSE statut_verification END,
  date_verification = CASE WHEN id BETWEEN 1 AND 6 THEN DATE '2026-11-22' ELSE date_verification END,
  source_verification = CASE id
    WHEN 1 THEN 'https://www.service-public.fr/particuliers/vosdroits/R41448'
    WHEN 2 THEN 'https://www.caf.fr/allocataires/caf-de-la-reunion/actualites-departementales/prime-d-activite-pensez-verifier-vos-droits'
    WHEN 3 THEN 'https://www.chequeenergie.gouv.fr/beneficiaire/faq'
    WHEN 4 THEN 'https://caf.fr/allocataires/foire-aux-questions/vie-professionnelle'
    WHEN 5 THEN 'https://www.service-public.fr/particuliers/vosdroits/F13212'
    WHEN 6 THEN 'https://www.caf.fr/allocataires/caf-de-la-reunion/offre-de-service/vie-personnelle'
    ELSE source_verification END,
  periode_validite = CASE id
    WHEN 3 THEN 'Barème chèque énergie 2026 : 48 à 277 EUR selon RFR/UC ; ne pas extrapoler aux années suivantes'
    WHEN 2 THEN 'Principes CAF consultés en novembre 2026 ; barèmes à vérifier au dépôt du dossier'
    WHEN 1 THEN 'Principes aides au logement consultés en novembre 2026 ; montant à simuler'
    WHEN 4 THEN 'Principes RSA consultés en novembre 2026 ; montant à simuler'
    WHEN 5 THEN 'Principes ARS consultés en novembre 2026 ; barèmes de campagne à vérifier'
    WHEN 6 THEN 'Principes CMG consultés en novembre 2026 ; barème à simuler'
    ELSE periode_validite END
WHERE id BETWEEN 1 AND 12 AND revenus_max IS NOT NULL;
COMMIT;