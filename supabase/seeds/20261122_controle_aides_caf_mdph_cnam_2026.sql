-- 22/11/2026 - vérification des SOURCES officielles de 10 prestations prioritaires.
-- Confirmation d'une page source ≠ actualisation des barèmes, droit acquis ou éligibilité.
-- Le montant et les conditions dépendent du dossier. Ne pas dériver des seuils des mentions génériques.
WITH verified(id,src,description,steps,nature) AS (
  VALUES (21,'https://caf.fr/allocataires/caf-de-la-reunion/offre-de-service/handicap/aah-beneficiaire-de-l-allocation-aux-adultes-handicapees','AAH : allocation pour adultes en situation de handicap sous conditions ; la décision repose notamment sur l''évaluation MDPH et les ressources prises en compte. Les règles évoluent, sans plafond mensuel unique applicable à tous.','Déposer une demande de reconnaissance de droits à la MDPH de La Réunion et consulter sa CAF pour le calcul et le versement éventuel.','aide_financiere'),
(22,'https://www.service-public.gouv.fr/particuliers/vosdroits/F14202','PCH : prise en charge possible de certains besoins liés au handicap (aide humaine, technique, aménagement notamment). Les critères, plafonds de prise en charge et choix d''aide doivent être examinés par la MDPH et le Département.','Contacter la MDPH de La Réunion pour constituer un dossier et demander l''évaluation des besoins ; vérifier la décision et le financement auprès des organismes compétents.','aide_financiere'),
(23,'https://www.departement974.fr/aide/aide-apa-aide-lautonomie-domicile-pour-les-personnes-agees','APA : allocation pour une personne âgée en perte d''autonomie, notamment à domicile, évaluée selon le degré de perte d''autonomie et la situation. Le plan d''aide et la participation éventuelle sont déterminés par les services compétents.','Solliciter le service d''aide sociale aux adultes du Département ou son CCAS afin de demander une évaluation et de vérifier les pièces nécessaires.','aide_financiere'),
(72,'https://www.ameli.fr/assure/droits-demarches/difficultes-acces-droits-soins/complementaire-sante/complementaire-sante-solidaire','Complémentaire santé solidaire : prise en charge complémentaire des frais de santé selon conditions, gratuite ou avec participation. Les plafonds de ressources ne sont pas les mêmes pour tous les foyers et les départements d''outre-mer. Ce n''est pas un versement en espèces.','Consulter le simulateur de droits sur ameli.fr et déposer une demande auprès de l''Assurance Maladie. Vérifier les plafonds applicables à La Réunion et à son foyer.','reduction_tarifaire'),
(81,'https://www.caf.fr/allocataires/aides-et-demarches/droits-et-prestations/handicap/l-allocation-journaliere-du-proche-aidant-ajpa','AJPA : allocation pouvant compenser ponctuellement une diminution ou interruption d''activité professionnelle pour accompagner un proche en situation de handicap ou de perte d''autonomie ; les jours indemnisables et les incompatibilités dépendent des règles en vigueur.','Vérifier les conditions AJPA sur caf.fr, puis déposer une demande auprès de la CAF ou de la MSA selon son affiliation, avec les justificatifs nécessaires.','aide_financiere'),
(85,'https://caf.fr/allocataires/aides-et-demarches/ma-situation/handicap/j-ai-un-enfant-handicape-ou-gravement-malade','AEEH : allocation destinée à contribuer aux frais liés au handicap d''un enfant, selon décision de la CDAPH après dossier MDPH ; compléments éventuels soumis à évaluation. Aucun versement ne peut être garanti à la seule lecture du profil.','Contacter la MDPH pour le dossier de l''enfant ; la CDAPH étudie les droits et informe la CAF chargée du versement éventuel.','aide_financiere'),
(86,'https://www.caf.fr/allocataires/caf-de-la-reunion/actualites-departementales/tout-comprendre-sur-l-allocation-journaliere-de-presence-parentale-ajpp','AJPP : allocation journalière possible lorsqu''un parent doit réduire ou suspendre temporairement son activité pour assister un enfant gravement malade, accidenté ou handicapé, sous conditions. Les règles de cumul et la durée doivent être contrôlées.','Consulter la page AJPP de la CAF de La Réunion et effectuer la demande en joignant les justificatifs demandés, notamment médicaux.','aide_financiere'),
(87,'https://www.caf.fr/allocataires/caf-de-la-reunion/offre-de-service/accident-de-vie/parents-isoles-demandeurs-du-rsa-ou-de-l-asf','ASF : allocation de soutien familial pour certaines personnes assumant seules la charge d''un enfant ou l''ayant recueilli, suivant la situation familiale, la pension alimentaire et les règles applicables.','Vérifier sa situation dans son espace CAF et demander l''ASF si les conditions peuvent être réunies ; solliciter si nécessaire le service des pensions alimentaires.','aide_financiere'),
(106,'https://www.caf.fr/allocataires/caf-de-la-reunion/actualites-departementales/violences-conjugales-une-aide-financiere-d-urgence-pour-quitter-le-domicile-en-securite','AVVC : aide financière d''urgence destinée aux personnes victimes de violences conjugales afin de faciliter leur mise en sécurité, sur demande et pièces prévues. Elle peut prendre des formes différentes selon la situation, sans montant garanti à l''avance.','Consulter la page de la CAF de La Réunion et la procédure de demande AVVC. En cas de danger immédiat, appeler le 17 ou 112.','aide_financiere'),
(115,'https://caf.fr/allocataires/caf-de-la-reunion/actualites-departementales/tout-comprendre-sur-la-prime-de-demenagement','Prime de déménagement CAF : aide destinée à certaines familles nombreuses qui déménagent lorsque le foyer s''agrandit. Le droit dépend notamment des conditions liées aux enfants, à la période du déménagement et à une aide au logement. Non universelle.','Lire les conditions détaillées de la CAF de La Réunion et déposer une demande avec factures et justificatifs dans les délais applicables.','aide_financiere')
)
UPDATE public.aides_reunion a
SET description_fr=verified.description,
    description=verified.description,
    demarches_fr=verified.steps,
    lien_officiel=verified.src,
    lien=verified.src,
    source_verification=verified.src,
    type_dispositif=verified.nature,
    statut_verification='source_confirmee',
    date_verification=DATE '2026-11-22',
    periode_validite='Source institutionnelle consultée le 22/11/2026. Barèmes, admissibilité, montant éventuel et état du dispositif à confirmer avec l organisme et la règle en vigueur.',
    revenus_max=NULL,
    montant_min=CASE WHEN a.id=72 THEN NULL ELSE montant_min END,
    montant_max=CASE WHEN a.id=72 THEN NULL ELSE montant_max END
FROM verified
WHERE a.id=verified.id AND a.actif=true;
SELECT count(*) confirmed_in_batch FROM public.aides_reunion
WHERE id IN (21,22,23,72,81,85,86,87,106,115) AND actif AND statut_verification='source_confirmee' AND date_verification=DATE '2026-11-22';
SELECT count(*) FILTER (WHERE actif) AS actives,
 count(*) FILTER (WHERE actif AND statut_verification='a_verifier') AS a_verifier,
 count(*) FILTER (WHERE actif AND statut_verification='a_reconfirmer') AS a_reconfirmer
FROM public.aides_reunion;