from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import tempfile
import unittest

from app.collectors.carrefour_reunion import (
    build_carrefour_observation,
    run_carrefour_reunion_readonly,
    stable_readonly_signature,
)
from app.extractors.carrefour_reunion_products import parse_carrefour_page
from app.main import TextDocument
from app.services.carrefour_reunion_incremental import (
    plan_carrefour_incremental_observations,
    run_carrefour_reunion_incremental,
)
from app.services.leader_price_importer import to_rpc_item
from app.services.retail_price_deduplication import deduplicate_observations
from app.settings import Settings


SOURCE_URL = "https://www.carrefour-reunion.com/catalogues/carrefour"
SOURCE_SCOPES = ((SOURCE_URL, "carrefour-reunion", "Carrefour Réunion"),)


class _FakeFetcher:
    def __init__(self, html: str) -> None:
        self.html = html

    def fetch_text(self, url: str, *, allowed_hosts, settings) -> TextDocument:
        return TextDocument(url=url, content_type="text/html", text=self.html)


class _NoWriteClient:
    def __init__(self) -> None:
        self.select_calls = []
        self.rpc_calls = []

    def select(self, table: str, *, filters=None, columns="*"):
        self.select_calls.append((table, filters, columns))
        return []

    def rpc(self, function_name: str, payload=None):
        self.rpc_calls.append((function_name, payload))
        return {"imported": len((payload or {}).get("p_items", []))}


def _price_html(current: float, original: float | None = None) -> str:
    def parts(value: float) -> tuple[int, int]:
        cents = int(round(value * 100))
        return cents // 100, cents % 100

    current_int, current_cents = parts(current)
    old = ""
    if original is not None:
        old_int, old_cents = parts(original)
        old = (
            '<div class="price"><p class="price-cross">'
            f"{old_int}</p><p class=\"cents\">{old_cents:02d}</p></div>"
        )
    return (
        old
        + '<div class="price cash-price"><p class="text-price-red">'
        f"{current_int}</p><p class=\"cents\">{current_cents:02d}</p></div>"
    )


def _card_html(
    index: int,
    *,
    name: str | None = None,
    brand: str | None = "MARQUE",
    description: str | None = None,
    current: float = 2.49,
    original: float | None = 3.19,
    image_key: str | None = None,
    native_id: str | None = None,
    retailer_class: str = "carrefour",
) -> str:
    resolved_name = name or f"Produit {index}"
    resolved_description = description if description is not None else f"Saveur test {100 + index} g"
    resolved_image = image_key or f"aa/bb/product-{index}.jpg"
    native = f' data-product-id="{native_id}"' if native_id else ""
    brand_html = f'<p class="marks">{brand}</p>' if brand is not None else ""
    description_html = (
        f'<p class="description">{resolved_description}</p>'
        if resolved_description
        else ""
    )
    return f"""
    <div class="discount {retailer_class}"{native}>
      <div class="body"><img src="https://www.carrefour-reunion.com/glide/local/attachments/{resolved_image}?w=400&amp;s=volatile" alt="{resolved_name}">
        <div class="price-box">{_price_html(current, original)}</div>
        <p class="designation">{resolved_name}</p>
        {brand_html}{description_html}
      </div>
    </div>
    """


def _html(cards: list[str]) -> str:
    return "<html><body>" + "".join(cards) + "</body></html>"


def _settings(name: str) -> Settings:
    root = Path(tempfile.gettempdir()) / "budgetkazpei-carrefour-tests" / name
    root.mkdir(parents=True, exist_ok=True)
    return Settings.from_env().with_overrides(report_path=root / "placeholder.json")


def _run(html: str, name: str):
    settings = _settings(name)
    return run_carrefour_reunion_readonly(
        settings,
        fetcher=_FakeFetcher(html),
        report_path=settings.report_path.parent / "readonly.json",
        source_scopes=SOURCE_SCOPES,
    )


def _unique_rows(report):
    return [item.to_dict() for item in report.observations if not item.is_duplicate]


class CarrefourReunionCollectorTests(unittest.TestCase):
    def test_a_69_rendered_cards_become_30_unique_products(self):
        unique = [_card_html(index) for index in range(30)]
        report = _run(_html([*unique, *unique, *unique[:9]]), "dedupe-69")
        self.assertEqual(report.metrics.cards_detected, 69)
        self.assertEqual(report.metrics.unique_products, 30)
        self.assertEqual(report.metrics.carousel_duplicates_removed, 39)

    def test_b_same_html_twice_keeps_ids_keys_and_commercial_fingerprints(self):
        html = _html([_card_html(index) for index in range(5)])
        first = _run(html, "idempotence-first")
        second = _run(html, "idempotence-second")
        self.assertEqual(stable_readonly_signature(first), stable_readonly_signature(second))

    def test_c_dom_order_does_not_change_stable_signature(self):
        cards = [_card_html(index) for index in range(7)]
        first = _run(_html(cards), "order-first")
        second = _run(_html(list(reversed(cards))), "order-second")
        self.assertEqual(stable_readonly_signature(first), stable_readonly_signature(second))

    def test_d_price_change_keeps_product_identity_and_changes_commercial_state(self):
        first = _run(_html([_card_html(1, current=2.49, original=None)]), "price-first")
        second = _run(_html([_card_html(1, current=2.19, original=None)]), "price-second")
        first_row = _unique_rows(first)[0]
        second_row = _unique_rows(second)[0]
        self.assertEqual(first_row["source_product_id"], second_row["source_product_id"])
        candidates, unchanged, actions, _ = plan_carrefour_incremental_observations(second, [first_row])
        self.assertEqual(len(candidates), 1)
        self.assertEqual(unchanged, [])
        self.assertEqual(actions[0].change_type, "price_change")

    def test_e_old_price_appearing_creates_new_promotion(self):
        normal = _run(_html([_card_html(2, current=2.49, original=None)]), "promo-normal")
        promo = _run(_html([_card_html(2, current=2.19, original=2.49)]), "promo-new")
        candidates, unchanged, actions, _ = plan_carrefour_incremental_observations(
            promo,
            _unique_rows(normal),
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(unchanged, [])
        self.assertEqual(actions[0].change_type, "new_promotion")

    def test_f_old_price_disappearing_returns_to_normal(self):
        promo = _run(_html([_card_html(3, current=2.19, original=2.49)]), "return-promo")
        normal = _run(_html([_card_html(3, current=2.49, original=None)]), "return-normal")
        candidates, unchanged, actions, _ = plan_carrefour_incremental_observations(
            normal,
            _unique_rows(promo),
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(unchanged, [])
        self.assertEqual(actions[0].change_type, "return_to_normal")

    def test_g_missing_brand_still_has_deterministic_review_identity(self):
        html = _html([_card_html(4, brand=None)])
        first = _run(html, "brand-first")
        second = _run(html, "brand-second")
        first_item = [item for item in first.observations if not item.is_duplicate][0]
        second_item = [item for item in second.observations if not item.is_duplicate][0]
        self.assertEqual(first_item.source_product_id, second_item.source_product_id)
        self.assertIn("missing_brand", first_item.match_warnings)

    def test_h_missing_format_uses_stable_text_to_avoid_silent_collision(self):
        page = parse_carrefour_page(
            _html(
                [
                    _card_html(5, name="Produit sans format", description="Saveur vanille", image_key="aa/one.jpg"),
                    _card_html(6, name="Produit sans format", description="Saveur chocolat", image_key="bb/two.jpg"),
                ]
            ),
            source_url=SOURCE_URL,
        )
        observations = [
            build_carrefour_observation(card, observed_at="2026-08-31T10:00:00Z")
            for card in page.cards
        ]
        unique, summary = deduplicate_observations(observations)
        self.assertEqual(summary.unique_observations, 2)
        self.assertNotEqual(unique[0].source_product_id, unique[1].source_product_id)
        self.assertTrue(all("missing_package_format" in item.match_warnings for item in unique))

    def test_weak_identity_ignores_volatile_image_asset_path(self):
        first = _run(
            _html([_card_html(16, brand=None, image_key="old/random-one.jpg")]),
            "weak-image-first",
        )
        second = _run(
            _html([_card_html(16, brand=None, image_key="new/random-two.jpg")]),
            "weak-image-second",
        )
        self.assertEqual(
            _unique_rows(first)[0]["source_product_id"],
            _unique_rows(second)[0]["source_product_id"],
        )

    def test_i_close_truncated_cards_with_different_images_do_not_merge(self):
        cards = [
            _card_html(7, name="Crème glacée", description="Vanille et chocolat 28...", image_key="cc/one.jpg"),
            _card_html(8, name="Crème glacée", description="Vanille et caramel 28...", image_key="dd/two.jpg"),
        ]
        report = _run(_html(cards), "truncated")
        self.assertEqual(report.metrics.unique_products, 2)
        self.assertEqual(report.metrics.ambiguous_products, 2)

    def test_j_dry_run_reads_supabase_baseline_but_never_writes(self):
        client = _NoWriteClient()
        settings = _settings("dry-run")
        report = run_carrefour_reunion_incremental(
            settings,
            fetcher=_FakeFetcher(_html([_card_html(9)])),
            dry_run=True,
            client=client,
            report_path=settings.report_path.parent / "incremental.json",
        )
        self.assertEqual(len(client.select_calls), 3)
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(report.baseline_source, "supabase")
        self.assertFalse(report.to_dict()["writes"]["retail_price_candidates"])
        self.assertFalse(report.to_dict()["writes"]["shopping_promotions"])
        self.assertFalse(report.to_dict()["writes"]["market_price_observations"])

    def test_second_real_run_refreshes_unchanged_candidate_without_creating_one(self):
        client = _NoWriteClient()
        settings = _settings("real-refresh")
        collection = _run(_html([_card_html(15)]), "real-refresh-baseline")
        existing = _unique_rows(collection)[0]
        existing.update({
            "id": "candidate-15",
            "source_run_id": "run-15",
            "duplicate_key": "duplicate-15",
        })
        report = run_carrefour_reunion_incremental(
            settings,
            fetcher=_FakeFetcher(_html([_card_html(15)])),
            dry_run=False,
            client=client,
            existing_rows=[existing],
            report_path=settings.report_path.parent / "incremental-refresh.json",
        )
        self.assertEqual(report.metrics.candidates_created, 0)
        self.assertEqual(report.metrics.candidates_refreshed, 1)
        self.assertEqual(report.metrics.unchanged, 1)
        self.assertEqual([name for name, _ in client.rpc_calls], ["retail_import_price_candidates"])
        self.assertEqual(client.rpc_calls[0][1]["p_source_run_id"], "run-15")
        self.assertEqual(client.rpc_calls[0][1]["p_items"][0]["duplicate_key"], "duplicate-15")

    def test_native_data_product_id_wins_over_synthetic_identity(self):
        page = parse_carrefour_page(
            _html([_card_html(10, native_id="SKU-123", image_key="old/image.jpg")]),
            source_url=SOURCE_URL,
        )
        item = build_carrefour_observation(page.cards[0], observed_at="2026-08-31T10:00:00Z")
        self.assertEqual(item.source_product_id, "SKU-123")
        self.assertEqual(item.raw_evidence["identity_kind"], "native:data-product-id")

    def test_unit_price_and_retailer_scope_are_extracted_without_store_city(self):
        report = _run(
            _html(
                [
                    _card_html(
                        11,
                        description="44 doses La dose : 0,09 € 1,98 L",
                        original=5.24,
                        current=3.90,
                    )
                ]
            ),
            "unit-price",
        )
        item = [item for item in report.observations if not item.is_duplicate][0]
        self.assertEqual((item.unit_price, item.unit_price_unit), (0.09, "unite"))
        self.assertEqual(item.store_slug, "carrefour-reunion")
        self.assertIsNone(to_rpc_item(item.to_dict(), default_store_city=None)["store_city"])

    def test_current_price_without_old_price_is_not_marked_as_promotion(self):
        report = _run(_html([_card_html(12, original=None)]), "observed-only")
        item = [item for item in report.observations if not item.is_duplicate][0]
        self.assertFalse(item.promotion_proven)
        self.assertEqual(item.price_type, "observed_price")
        self.assertIsNone(item.original_price)

    def test_readonly_report_declares_no_remote_writes(self):
        report = _run(_html([_card_html(13)]), "write-contract")
        writes = report.to_dict()["writes"]
        self.assertTrue(all(value is False for value in writes.values()))

    def test_real_mode_targets_staging_rpc_only_and_keeps_publication_disabled(self):
        client = _NoWriteClient()
        settings = _settings("real-staging-only")
        report = run_carrefour_reunion_incremental(
            settings,
            fetcher=_FakeFetcher(_html([_card_html(14)])),
            dry_run=False,
            client=client,
            existing_rows=[],
            report_path=settings.report_path.parent / "incremental-real.json",
        )
        self.assertEqual([name for name, _ in client.rpc_calls], ["retail_import_price_candidates"])
        rpc_items = client.rpc_calls[0][1]["p_items"]
        self.assertTrue(rpc_items)
        self.assertTrue(all(item["store_city"] is None for item in rpc_items))
        writes = report.to_dict()["writes"]
        self.assertTrue(writes["retail_price_candidates"])
        self.assertFalse(writes["retail_price_observations"])
        self.assertFalse(writes["market_price_observations"])
        self.assertFalse(writes["shopping_promotions"])
        self.assertFalse(writes["good_deals"])


if __name__ == "__main__":
    unittest.main()
