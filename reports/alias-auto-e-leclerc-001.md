# Market Alias Library Dry Run

- batch_id: alias-auto-e-leclerc-001
- date: 2026-08-06T17:34:33.845Z
- source_mode: file
- store_chain_filter: e leclerc
- target_chain: e leclerc
- requested_labels: 20
- selected_labels: 20
- excluded_already_covered: 0
- dry_run: true

## Summary

- exact_strong: 0
- strong_without_barcode: 0
- active_library_ready: 0
- suggestions: 0
- ambiguous: 4
- rejected: 0
- not_found: 16
- source_unavailable: 0
- network_error_groups: 6

## Batch Labels

| raw_label | frequency | chain | category | package | classification | action |
| --- | ---: | --- | --- | --- | --- | --- |
| PAVE NATURE POLETTE | 23 | e leclerc | alimentaire |  | not_found | not_found |
| POULET FRAIS ROTI TRADITION | 23 | e leclerc | alimentaire |  | not_found | not_found |
| PAIN MIE SAND | 11 | e leclerc | alimentaire |  | not_found | not_found |
| ARRANGE RDH ANANAS/ROTI TOCL | 20 | e leclerc | alimentaire |  | not_found | not_found |
| PATE CAMPAGNE DEMOULE GENERIQU | 20 | e leclerc | alimentaire |  | not_found | not_found |
| PETIT PAIN BLANC K10 | 20 | e leclerc | alimentaire |  | not_found | not_found |
| ROQUEFORT AOP L CR NRT,KG | 20 | e leclerc | alimentaire |  | not_found | not_found |
| NATAUIE BISCUIT CHOCOLAT | 9 | e leclerc | alimentaire |  | not_found | not_found |
| BURGER CURCUMA | 8 | e leclerc | alimentaire |  | ambiguous | staging |
| LENTILLES CUITES | 7 | e leclerc | alimentaire |  | not_found | not_found |
| Compote Pomme | 6 | e leclerc | alimentaire |  | ambiguous | staging |
| OLIVE VRT DEN | 6 | e leclerc | alimentaire |  | not_found | not_found |
| LENTILLE GRA | 5 | e leclerc | alimentaire |  | not_found | not_found |
| PART PIZZA REBLOCH | 5 | e leclerc | alimentaire |  | not_found | not_found |
| BURGER CURCUMA H1'KIF X4 2706 | 4 | e leclerc | alimentaire |  | not_found | not_found |
| Compote de pomme 4 x 100 g | 4 | e leclerc | alimentaire |  | ambiguous | staging |
| MACED LEGUMES | 4 | e leclerc | alimentaire |  | ambiguous | staging |
| MIMOLETTE UTEOL FORT,200G | 4 | e leclerc | alimentaire |  | not_found | not_found |
| PAIN MIE SANDU CFLET YAMI 42OE | 4 | e leclerc | alimentaire |  | not_found | not_found |
| PARNIG.REGGIANO EOH | 4 | e leclerc | alimentaire |  | not_found | not_found |

## Coverage By Chain

| chain | raw labels | manual aliases | active aliases | unknown | products known | in review |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| e leclerc | 179 | 3 | 590 | 166 | 13 | 0 |
| leader price | 57 | 0 | 590 | 57 | 0 | 0 |
| u | 20 | 0 | 590 | 20 | 0 | 0 |

## Source Errors

| source | status | reason | products_affected | attempts | cache_hits | sample labels |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| open_food_facts_search | 503 | external_fetch_failed:open_food_facts_search:503:3:https://world.openfoodfacts.org/cgi/search.pl?search_terms=POULET%20FRAIS%20ROTI%20TRADITION&search_simple=1&action=process&json=1&page_size=8 | 1 | 3 | 0 | POULET FRAIS ROTI TRADITION |
| open_food_facts_search | 503 | external_fetch_failed:open_food_facts_search:503:3:https://world.openfoodfacts.org/cgi/search.pl?search_terms=PAIN%20MIE%20SAND&search_simple=1&action=process&json=1&page_size=8 | 1 | 3 | 0 | PAIN MIE SAND |
| open_food_facts_search | 503 | external_fetch_failed:open_food_facts_search:503:3:https://world.openfoodfacts.org/cgi/search.pl?search_terms=PATE%20CAMPAGNE%20DEMOULE%20GENERIQU&search_simple=1&action=process&json=1&page_size=8 | 1 | 3 | 0 | PATE CAMPAGNE DEMOULE GENERIQU |
| open_food_facts_search | 503 | external_fetch_failed:open_food_facts_search:503:3:https://world.openfoodfacts.org/cgi/search.pl?search_terms=Compote%20Pomme&search_simple=1&action=process&json=1&page_size=8 | 1 | 3 | 0 | Compote Pomme |
| open_food_facts_search | 503 | external_fetch_failed:open_food_facts_search:503:3:https://world.openfoodfacts.org/cgi/search.pl?search_terms=MIMOLETTE%20UTEOL%20FORT%2C200G&search_simple=1&action=process&json=1&page_size=8 | 1 | 3 | 0 | MIMOLETTE UTEOL FORT,200G |
| open_food_facts_search | 503 | external_fetch_failed:open_food_facts_search:503:3:https://world.openfoodfacts.org/cgi/search.pl?search_terms=PAIN%20MIE%20SANDU%20CFLET%20YAMI%2042OE&search_simple=1&action=process&json=1&page_size=8 | 1 | 3 | 0 | PAIN MIE SANDU CFLET YAMI 42OE |

## Curated Proof Audit

| raw_label | found_name | ticket_brand | source_brand | ticket_package | source_package | domain | checked_at | source_type | classification | justification | source_url | factual_excerpt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Compote Pomme | Compote de pomme 4 x 100 g |  |  |  | 4 x 100 g | e.leclerc | 2026-07-27 | official_exact_page | ambiguous | exact_name_and_package_but_private_label_brand_missing_on_ticket | https://www.e.leclerc/fp/coupelles-allegees-en-sucres-pomme-4-x-100-g-eco-3450970027847 | Page produit E.Leclerc mentionnant coupelles pomme ECO+ par 4 x 100 g. |
| Compote de pomme 4 x 100 g | Compote de pomme 4 x 100 g |  |  | 4 x 100 g | 4 x 100 g | e.leclerc | 2026-07-27 | official_exact_page | ambiguous | exact_name_and_package_but_private_label_brand_missing_on_ticket | https://www.e.leclerc/fp/coupelles-allegees-en-sucres-pomme-4-x-100-g-eco-3450970027847 | Page produit E.Leclerc mentionnant coupelles pomme ECO+ par 4 x 100 g. |
| MACED LEGUMES | Macedoine de legumes 265 g |  | Notre Jardin |  | 265 g | drivezeclerc.re | 2026-07-27 | commercial_exact_page | ambiguous | generic_label_and_multiple_private_label_variants_in_chain | https://www.drivezeclerc.re/st-benoit/epicerie-salee/8636-macedoine-de-legumes-1-2-265g-pne1058969.html | Page commerciale E.Leclerc Reunion mentionnant macedoine de legumes 265 g. |

## Commands

```bash
node scripts/enrich_market_alias_candidates.mjs --from-file C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\reports\alias-auto-e-leclerc-001-input.json --store-chain "e leclerc" --limit 20 --offset 0 --batch-id alias-auto-e-leclerc-001 --dry-run --report C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\reports\alias-auto-e-leclerc-001.json
```
