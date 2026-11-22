-- 22/11/2026. Remplace les orientations vagues par des sources exactes.
-- Vérification de source ≠ éligibilité. FSL : règlement affiché 2021-2024 obsolète.
BEGIN;
UPDATE public.aides_reunion SET
  nom='Fonds solidarité logement',description='Fonds de solidarité pour le logement (FSL) de La Réunion : aides possibles pour l''accès au logement, les impayés de loyer, d''eau ou d''énergie et accompagnement social, selon un examen de la situation. La page départementale renvoie encore au règlement 2021-2024 : ne pas utiliser ses barèmes pour calculer des droits en 2026.',description_fr='Fonds de solidarité pour le logement (FSL) de La Réunion : aides possibles pour l''accès au logement, les impayés de loyer, d''eau ou d''énergie et accompagnement social, selon un examen de la situation. La page départementale renvoie encore au règlement 2021-2024 : ne pas utiliser ses barèmes pour calculer des droits en 2026.',
  demarches_fr='Contacter un travailleur social habilité (CCAS, Département, CAF, association) : c''est lui qui prépare et transmet la demande au FSL. Vérifier les règles et plafonds actuels avec le service instructeur.',lien='https://www.departement974.fr/aide/aide-habitat-fsl-fonds-de-solidarite-pour-logement',lien_officiel='https://www.departement974.fr/aide/aide-habitat-fsl-fonds-de-solidarite-pour-logement',
  source_verification='https://www.departement974.fr/aide/aide-habitat-fsl-fonds-de-solidarite-pour-logement',date_verification=DATE '2026-11-22',
  type_dispositif='aide_financiere',statut_verification='a_reconfirmer',
  periode_validite='Page départementale officielle consultée en 2026, mais règlement de référence 2021-2024 : critères et plafonds à reconfirmer impérativement.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=64 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide dépôt de garantie — AVANCE LOCA-PASS',description='L''AVANCE LOCA-PASS d''Action Logement est un prêt à taux zéro et sans frais pour financer tout ou partie du dépôt de garantie d''une location, sous conditions. C''est une avance remboursable, pas une subvention gratuite ni un droit automatique.',description_fr='L''AVANCE LOCA-PASS d''Action Logement est un prêt à taux zéro et sans frais pour financer tout ou partie du dépôt de garantie d''une location, sous conditions. C''est une avance remboursable, pas une subvention gratuite ni un droit automatique.',
  demarches_fr='Vérifier les conditions d''éligibilité et les délais de dépôt sur le site Action Logement puis déposer sa demande via la plateforme officielle. Ne pas cumuler sans vérifier les règles des aides de même nature.',lien='https://www.actionlogement.fr/l-avance-loca-pass',lien_officiel='https://www.actionlogement.fr/l-avance-loca-pass',
  source_verification='https://www.actionlogement.fr/l-avance-loca-pass',date_verification=DATE '2026-11-22',
  type_dispositif='aide_financiere',statut_verification='source_confirmee',
  periode_validite='Source officielle consultée en novembre 2026 ; vérifier critères, tarifs et procédure avant demande.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=66 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide retard de loyer — orientation FSL et prévention expulsion',description='En cas de retard de loyer ou risque d''expulsion, le ménage peut solliciter le bailleur, les services sociaux et les aides existantes comme le FSL, selon sa situation. Cette fiche est un parcours d''orientation et ne garantit aucune prise en charge financière.',description_fr='En cas de retard de loyer ou risque d''expulsion, le ménage peut solliciter le bailleur, les services sociaux et les aides existantes comme le FSL, selon sa situation. Cette fiche est un parcours d''orientation et ne garantit aucune prise en charge financière.',
  demarches_fr='Contacter rapidement son bailleur et un travailleur social ou l''ADIL pour examiner ses droits, un éventuel échéancier et une demande FSL. Ne pas attendre une procédure d''expulsion.',lien='https://www.service-public.fr/particuliers/vosdroits/F31272',lien_officiel='https://www.service-public.fr/particuliers/vosdroits/F31272',
  source_verification='https://www.service-public.fr/particuliers/vosdroits/F31272',date_verification=DATE '2026-11-22',
  type_dispositif='orientation',statut_verification='source_confirmee',
  periode_validite='Source officielle consultée en novembre 2026 ; vérifier critères, tarifs et procédure avant demande.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=65 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide cantine mairie',description='Les familles peuvent, selon leur commune et la situation de leur enfant, bénéficier de réductions ou d''une prise en charge partielle de la cantine scolaire. Le règlement, les barèmes et les conditions sont locaux, sans tarif applicable automatiquement à toute La Réunion.',description_fr='Les familles peuvent, selon leur commune et la situation de leur enfant, bénéficier de réductions ou d''une prise en charge partielle de la cantine scolaire. Le règlement, les barèmes et les conditions sont locaux, sans tarif applicable automatiquement à toute La Réunion.',
  demarches_fr='Consulter la mairie ou l''établissement de l''enfant et demander le règlement de tarification scolaire ou la procédure de soutien aux frais de cantine.',lien='https://www.service-public.fr/particuliers/vosdroits/F1885',lien_officiel='https://www.service-public.fr/particuliers/vosdroits/F1885',
  source_verification='https://www.service-public.fr/particuliers/vosdroits/F1885',date_verification=DATE '2026-11-22',
  type_dispositif='reduction_tarifaire',statut_verification='source_confirmee',
  periode_validite='Source officielle consultée en novembre 2026 ; vérifier critères, tarifs et procédure avant demande.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=61 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide rentrée scolaire complémentaire',description='En complément des aides nationales, des aides locales ou fonds sociaux scolaires peuvent être demandés sous conditions. Il n''existe pas un versement complémentaire national uniforme. Cette fiche oriente vers les collectivités et établissements.',description_fr='En complément des aides nationales, des aides locales ou fonds sociaux scolaires peuvent être demandés sous conditions. Il n''existe pas un versement complémentaire national uniforme. Cette fiche oriente vers les collectivités et établissements.',
  demarches_fr='Se renseigner auprès de l''établissement scolaire et de la mairie sur les fonds sociaux, bourses et soutiens matériels de l''année scolaire en cours.',lien='https://www.service-public.fr/particuliers/vosdroits/F1885',lien_officiel='https://www.service-public.fr/particuliers/vosdroits/F1885',
  source_verification='https://www.service-public.fr/particuliers/vosdroits/F1885',date_verification=DATE '2026-11-22',
  type_dispositif='orientation',statut_verification='source_confirmee',
  periode_validite='Source officielle consultée en novembre 2026 ; vérifier critères, tarifs et procédure avant demande.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=63 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide mobilité jeunes — orientation continuité territoriale 2026',description='La Région Réunion présente plusieurs dispositifs de continuité territoriale en 2026, mais une aide pour la mobilité d''un jeune dépend du projet, du lieu de déplacement et des critères particuliers. Ceci n''est pas un dispositif universel pour tous les jeunes.',description_fr='La Région Réunion présente plusieurs dispositifs de continuité territoriale en 2026, mais une aide pour la mobilité d''un jeune dépend du projet, du lieu de déplacement et des critères particuliers. Ceci n''est pas un dispositif universel pour tous les jeunes.',
  demarches_fr='Décrire son projet (emploi, études, formation, déplacement) puis consulter l''aide 2026 adaptée auprès de la Région ou de LADOM ; vérifier période et pièces exigées.',lien='https://www.regionreunion.com/aides/continuite-territoriale-2026/',lien_officiel='https://www.regionreunion.com/aides/continuite-territoriale-2026/',
  source_verification='https://www.regionreunion.com/aides/continuite-territoriale-2026/',date_verification=DATE '2026-11-22',
  type_dispositif='orientation',statut_verification='source_confirmee',
  periode_validite='Campagne 2026 uniquement. Conditions et portail à réexaminer en 2027.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=45 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Continuité territoriale 2026 - Région Réunion',description='Dispositif de continuité territoriale reconduit par la Région et LADOM pour 2026. Les bons et aides varient selon destination, composition du foyer, ressources, historique des aides et type de déplacement. Aucun montant ni éligibilité ne peuvent être déduits d''un simple revenu mensuel.',description_fr='Dispositif de continuité territoriale reconduit par la Région et LADOM pour 2026. Les bons et aides varient selon destination, composition du foyer, ressources, historique des aides et type de déplacement. Aucun montant ni éligibilité ne peuvent être déduits d''un simple revenu mensuel.',
  demarches_fr='Consulter la page Région Réunion 2026 pour identifier le bon de transport ou l''aide spécifique, puis faire la demande sur le portail indiqué (LADOM ou Région selon le cas). Vérifier la validité pour 2027.',lien='https://www.regionreunion.com/aides/continuite-territoriale-2026/',lien_officiel='https://www.regionreunion.com/aides/continuite-territoriale-2026/',
  source_verification='https://www.regionreunion.com/aides/continuite-territoriale-2026/',date_verification=DATE '2026-11-22',
  type_dispositif='aide_financiere',statut_verification='source_confirmee',
  periode_validite='Campagne 2026 uniquement. Conditions et portail à réexaminer en 2027.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=97 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide réparation véhicule',description='La réparation d''un véhicule indispensable à l''insertion peut éventuellement être étudiée via des aides d''insertion ou de proximité, mais aucun programme forfaitaire général à la réparation n''a été confirmé. L''aide est une piste d''orientation, pas une allocation acquise.',description_fr='La réparation d''un véhicule indispensable à l''insertion peut éventuellement être étudiée via des aides d''insertion ou de proximité, mais aucun programme forfaitaire général à la réparation n''a été confirmé. L''aide est une piste d''orientation, pas une allocation acquise.',
  demarches_fr='Contacter un travailleur social ou un référent insertion afin d''expliquer le besoin de mobilité et de vérifier les aides disponibles et les devis acceptés.',lien='https://www.departement974.fr/aide/aide-aide-financiere-linsertion',lien_officiel='https://www.departement974.fr/aide/aide-aide-financiere-linsertion',
  source_verification='https://www.departement974.fr/aide/aide-aide-financiere-linsertion',date_verification=DATE '2026-11-22',
  type_dispositif='orientation',statut_verification='a_reconfirmer',
  periode_validite='Source officielle consultée en novembre 2026 ; vérifier critères, tarifs et procédure avant demande.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=53 AND actif = true;
UPDATE public.aides_reunion SET
  nom='Aide achat véhicule indispensable',description='L''achat d''un véhicule pour un projet d''emploi peut faire l''objet d''une étude sociale d''aide à l''insertion, mais aucune aide universelle à l''achat n''est garantie. Le projet et les conditions du Département doivent être vérifiés.',description_fr='L''achat d''un véhicule pour un projet d''emploi peut faire l''objet d''une étude sociale d''aide à l''insertion, mais aucune aide universelle à l''achat n''est garantie. Le projet et les conditions du Département doivent être vérifiés.',
  demarches_fr='Faire examiner un devis et l''utilité professionnelle du véhicule par son référent insertion, le Département ou sa Mission locale avant tout engagement.',lien='https://www.departement974.fr/aide/aide-aide-financiere-linsertion',lien_officiel='https://www.departement974.fr/aide/aide-aide-financiere-linsertion',
  source_verification='https://www.departement974.fr/aide/aide-aide-financiere-linsertion',date_verification=DATE '2026-11-22',
  type_dispositif='orientation',statut_verification='a_reconfirmer',
  periode_validite='Source officielle consultée en novembre 2026 ; vérifier critères, tarifs et procédure avant demande.',
  montant_min=NULL,montant_max=NULL,revenus_max=NULL
  WHERE id=54 AND actif = true;
COMMIT;
SELECT id,nom,statut_verification,type_dispositif,lien_officiel FROM public.aides_reunion WHERE id IN (64,66,65,61,63,45,97,53,54) ORDER BY id;
