# BudgetKazPei — pilote gratuit de collecte des prix Super U

## Ce qui est en place

- Collecteur Python autonome avec bibliothèque standard uniquement (zéro abonnement, zéro API payante, zéro OCR).
- Sources publiques LAPUB de l'île de La Réunion, par pages d'offres de taille limitée (max. 10).
- Domaine HTTPS autorisé seulement : `lapub.re` / `www.lapub.re`.
- Refus des redirections vers des domaines tiers. Respect de `robots.txt` et du refus d'accès.
- Script en **lecture seule** : pas de clé Supabase, pas d'écriture en base, pas de Cloud Run.
- Workflow GitHub Actions sur dépôt public, coureur standard `ubuntu-latest`. Aucun job planifié ; collecte seulement sur `workflow_dispatch`.
- Rapport JSON écrit dans les **journaux** de l'exécution, pas d'artefact à stocker.

## Conditions obligatoires avant toute publication

Chaque candidat reste `needs_review` et `can_auto_publish=false`.

1. **Article :** confirmer que désignation, marque, variante et format correspondent à l'annonce, et à la bonne fiche dans Supabase. Ne pas fusionner des formats différents.
2. **Enseigne :** vérifier qu'il s'agit bien de **Super U** et non d'Hyper U, U Express ou Carrefour. Identifier le magasin exact ; sinon ne pas affirmer une disponibilité locale.
3. **Prix :** comparer le montant au visuel / texte de la source et distinguer prix barré, remises immédiates, fidélité et prix du lot.
4. **Quantité et prix unitaire :** contrôler mathématiquement le prix au kg/L et détecter toute incohérence entre titre et conditionnement.
5. **Date :** conserver la date réelle de validité de l'offre ; si ancienne, l'utiliser comme **prix daté**, jamais comme prix actuel.
6. **Fiabilité :** confirmer l'annonce auprès d'une source officielle U ou d'un autre justificatif fiable ; LAPUB seul n'est pas une preuve finale suffisante pour une publication automatique.
7. **Doublons :** vérifier produit, enseigne, magasin, date, format, prix et source avant une éventuelle insertion.

Une fiche avec problème reste bloquée et **ne doit pas** être ajoutée aux prix publiables. Les prix sans prix unitaire confirmé, avec condition promotionnelle, ou pour lesquels le magasin ne peut être déterminé, exigent un examen explicite.

## Lancer les tests hors réseau

```bash
python3 -m unittest discover -v -s scripts/free_price_pilot -p 'test_*.py'
```

## Lancer un audit réel manuel (après revue des conditions de réutilisation)

Dans le dépôt GitHub : Actions > Free Super U price quality pilot > Run workflow. Fournir une vraie URL publique `https://lapub.re/offres/...` ou une page d'offres. Limiter à 3 articles pour le premier essai.

Les résultats ne sont **jamais** transmis à Supabase. Ils ne sont pas certifiés tant qu'une vérification manuelle n'a pas été faite. La collecte peut aussi se bloquer si `robots.txt` ou le site interdit l'accès, sans contournement.

## Coût

Les exécutants **standard** de GitHub Actions sont gratuits sur ce dépôt public. Aucun artefact, machine renforcée ou nouveau service hébergé n'est utilisé. Si le dépôt devient privé ou si les conditions GitHub évoluent, réévaluer le coût avant activation.

## État

Pilote en revue. Aucune exécution réelle, aucun prix importé, aucune automatisation récurrente. La création du code et les tests ne prouvent pas la disponibilité des pages publiques ou la validité des annonces.
