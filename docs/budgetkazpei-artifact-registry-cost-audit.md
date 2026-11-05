# BudgetKazPei - audit des couts d'images Docker (5 novembre 2026)

## Etat constate (facturation Google Cloud)

- Octobre 2026 : **0,19 EUR** Artifact Registry (sur 0,20 EUR HT factures).
- Cloud Run : environ 0,56 EUR avant credits, puis 0,00 EUR affiche
  apres credits (arrondis).
- Cloud Storage : environ 0,01 EUR net.
- Les trois Cloud Scheduler restants sont **Paused** ; ne pas les reactiver.
- Le scanner de tickets Cloud Run et les catalogues sont des services distincts.

**Ne pas conclure sans l'inventaire** que toutes les images couteuses sont
obsoletes : certaines correspondent au scanner encore utilise, a un job
courant, ou a une version de secours utile.

## Inventaire : lecture seule

1. Ouvrir Google Cloud Console > Artifact Registry > Repositories :
   https://console.cloud.google.com/artifacts?project=budgetkazpei
2. Repeter pour chaque depot Docker : image, nombre de versions,
   date des dernieres mises a jour, taille.
3. Rapprocher les images avec les services et jobs Cloud Run encore actifs
   (en particulier le scanner de tickets).
4. Pour un listing global sans risque, lancer dans Google Cloud Shell le
   fichier `scripts/audit-artifact-registry-readonly.sh`.
   Ce script n'execute ni job ni build, et ne modifie rien.

Les depots identifies par le script de deploiement BudgetKazPei incluent
potentiellement `budgetkazpei-jobs` en `europe-west9` pour les
images `budgetkazpei-good-deals-collector`. **Son existence et ses
versions restent a verifier dans le compte Google Cloud reel.**

## Decision de nettoyage - uniquement apres inventaire

- **A conserver absolument** : toute image/digest actuellement referencee
  par le scanner de tickets, les jobs Cloud Run deployes, une version
  explicitement retenue pour retour arriere.
- **Candidats** : anciennes versions devenues sans reference et sans usage
  dans la strategie de reprise.
- Ne jamais supprimer un depot entier simplement parce que le Scheduler
  qui lancait un job a ete suspendu/supprime.
- Commencer par une politique de nettoyage en mode **Dry run**.
- N'appliquer aucune regle automatique tant que la verification des digests
  actifs et les eventuelles versions de secours ne sont pas terminees.
- La taille totale et le cout a economiser doivent etre evalues sur les
  vraies images observees ; 0,19 EUR/mois est un plafond de frais constates,
  pas une economie garantie.

## References officielles

- Tarifs : https://cloud.google.com/artifact-registry/pricing
- Inventaire des images : https://docs.cloud.google.com/artifact-registry/docs/docker/manage-images
- Nettoyage et simulation :
  https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy

## Etape suivante

La capture de la **liste des depots Artifact Registry**, puis des versions
de chaque image du depot `europe-west9`, suffit pour etablir un premier
classement. A ce stade, aucune suppression ne doit etre effectuee.
