-- 22/11/2026, continuation après déploiement de l'application BudgetKazPeï.
-- Trois dispositifs Région Réunion 2026, sans montant individuel inventé.
-- Voyages pédagogiques : subvention pour l'établissement, pas pour l'élève.
DO $aides$
DECLARE r record;
BEGIN
  PERFORM pg_advisory_xact_lock(84690123);
  LOCK TABLE public.aides_reunion IN SHARE ROW EXCLUSIVE MODE;
  PERFORM setval(pg_get_serial_sequence('public.aides_reunion','id'),GREATEST((SELECT COALESCE(MAX(id),1) FROM public.aides_reunion),(SELECT last_value FROM public.aides_reunion_id_seq)),true);
  FOR r IN SELECT * FROM jsonb_to_recordset('[{"nom":"BRESM — bourse régionale d’études secondaires en mobilité 2026-2027","categorie":"jeunesse","organisme":"Région Réunion","type_dispositif":"aide_financiere","zone_couverte":"Familles réunionnaises dont un lycéen suit une formation secondaire hors de La Réunion","description_fr":"La Bourse Régionale d’Études Secondaires en Mobilité (BRESM) accompagne certains lycéens réunionnais qui doivent poursuivre hors de l’île une formation secondaire non disponible ou non accessible localement. L’aide peut contribuer aux frais de départ, d’installation et de scolarité, sous conditions de formation, de scolarité préalable et de ressources. Aucun montant n’est garanti sans instruction.","demarches_fr":"Consulter le règlement et le dossier BRESM 2026-2027 sur le site de la Région Réunion, vérifier l’établissement, le parcours du lycéen, la résidence fiscale et les plafonds applicables avant de déposer la demande.","src":"https://www.regionreunion.com/aides/bourse-regionale-detudes-secondaires-en-mobilite-bresm/","period":"Dispositif 2026-2027 reconduit par la Région ; dates de dépôt et barèmes individuels à vérifier sur le portail.","score_priorite":93},{"nom":"Voyages pédagogiques et échanges scolaires — soutien Région 2026","categorie":"jeunesse","organisme":"Région Réunion","type_dispositif":"accompagnement","zone_couverte":"Lycées et MFR participant à La Réunion","description_fr":"Dispositif régional pour soutenir les établissements qui organisent des voyages pédagogiques et des échanges scolaires. L’aide est attribuée à l’établissement porteur du projet, et non directement à l’élève ou à sa famille. Une participation des familles peut subsister suivant le projet.","demarches_fr":"Demander au lycée ou à la MFR si un voyage pédagogique financé par la Région est proposé ; l’établissement se charge du dossier régional, pas la famille.","src":"https://www.regionreunion.com/aides/voyages-pedagogiques/","period":"Page régionale actualisée en août 2026 ; projets et participation selon établissements.","score_priorite":86},{"nom":"AREASM — études artistiques secondaires en métropole","categorie":"jeunesse","organisme":"Région Réunion","type_dispositif":"aide_financiere","zone_couverte":"Lycéens réunionnais en filière artistique de haut niveau hors de l’île","description_fr":"Aide Régionale pour les Études Artistiques Secondaires en Métropole (AREASM), destinée aux jeunes lycéens réunionnais ayant un projet sérieux de formation artistique de haut niveau nécessitant une mobilité. L’éligibilité, les frais pris en charge et les justificatifs dépendent du règlement de la campagne.","demarches_fr":"Consulter la fiche AREASM et le portail de démarches de la Région ; vérifier le calendrier 2026-2027 avant de préparer l’admission dans une filière artistique et le dossier.","src":"https://www.regionreunion.com/aides/aides-regionales-pour-les-etudes-artistiques-secondaires-en-metropole-areasm/","period":"Page régionale publiée le 26 août 2026 ; sessions, montants et dates à contrôler.","score_priorite":90}]'::jsonb) AS x(
    nom text,categorie text,organisme text,type_dispositif text,
    zone_couverte text,description_fr text,demarches_fr text,src text,period text,score_priorite integer)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.aides_reunion WHERE lower(trim(nom))=lower(trim(r.nom))) THEN
      INSERT INTO public.aides_reunion (
        nom,categorie,organisme,type_dispositif,zone_couverte,description,description_fr,
        description_kreol,demarches_fr,demarches_kreol,lien,lien_officiel,source_verification,
        date_verification,periode_validite,statut_verification,score_priorite,actif
      ) VALUES (
        r.nom,r.categorie,r.organisme,r.type_dispositif,r.zone_couverte,r.description_fr,r.description_fr,
        'Dispozitif Région pou certains lycéens. Vérifi critèr, démarche ek dat avant demande.',
        r.demarches_fr,'Guette informations officiel Région ek contacte l’établissement scolaire si nécessaire.',
        r.src,r.src,r.src,DATE '2026-11-22',r.period,'source_confirmee',r.score_priorite,true
      );
    END IF;
  END LOOP;
END $aides$;
SELECT count(*) total, count(*) FILTER(WHERE actif) actifs, max(id) maxid FROM public.aides_reunion;