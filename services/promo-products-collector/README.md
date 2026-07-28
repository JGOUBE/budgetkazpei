# Promo Products Collector

Collecteur séparé du MVP produits promotionnels E.Leclerc Réunion.

Phase 1 uniquement:
- découverte des catalogues depuis la page officielle;
- détection de la visionneuse FlipHTML5;
- extraction ordonnée des pages `files/large/*.webp` depuis `config.js`;
- calcul des empreintes SHA-256, tailles et métadonnées HTTP;
- dry-run intégral par défaut;
- aucune publication produit;
- aucun OCR;
- aucune image stockée durablement.

## Variables utiles

- `PROMO_COLLECTOR_DRY_RUN=true`
- `PROMO_COLLECTOR_MAX_CATALOGS=1`
- `PROMO_COLLECTOR_MAX_PAGES=0`
- `PROMO_COLLECTOR_TARGET_CATALOG=26runRDC`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Exécution

```bash
python -m app.main
```

Test réseau limité:

```bash
python -m app.main --max-pages 3
```
