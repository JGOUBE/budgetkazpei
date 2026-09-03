from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from app.collectors.eleclerc_drive_reunion import (
    PILOT_STORE,
    build_eleclerc_observation,
    is_valid_ean13,
    parse_product_page,
    run_eleclerc_reunion_readonly,
    stable_readonly_signature,
)
from app.main import TextDocument
from app.services.eleclerc_reunion_incremental import (
    plan_eleclerc_incremental_observations,
    run_eleclerc_reunion_incremental,
)
from app.settings import Settings


ROOT_URL = PILOT_STORE.root_url
CATEGORY_URL = PILOT_STORE.primary_category_url


def _product_url(product_id: int) -> str:
    return f"https://www.drivezeclerc.re/portail-st-leu/epicerie-salee/{product_id}-produit-{product_id}-100-g.html"


def _detail_html(
    product_id: int,
    *,
    price: float = 2.0,
    original_price: float | None = None,
    reference: str = "3168930000983",
    brand: str | None = "MARQUE",
    package: str = "100g",
    unit_price: str = "20.00 € / kg",
    availability: str = "InStock",
    promo_from: str | None = None,
    promo_to: str | None = None,
    id_shop: str = "6",
) -> str:
    brand_html = (
        f'<p id="product_reference"><label>Marque : </label><span itemprop="sku">{brand}</span></p>'
        if brand is not None
        else ""
    )
    old_price_html = (
        f'<p id="old_price"><span>{original_price:.2f} €</span></p>'
        if original_price is not None
        else '<p id="old_price" class="hidden"><span></span></p>'
    )
    if promo_from and promo_to:
        specific = (
            '{"id_product":"%s","id_shop":"%s","price":%.2f,'
            '"reduction":"%.2f","reduction_type":"amount",'
            '"from":"%s","to":"%s"}'
            % (
                product_id,
                id_shop,
                original_price or price,
                max(0.01, (original_price or price) - price),
                promo_from,
                promo_to,
            )
        )
    else:
        specific = "null"
    return f"""
    <html><body>
      <div class="breadcrumb"><a itemprop="url" href="{CATEGORY_URL}">EPICERIE SALEE</a></div>
      <div itemscope itemtype="https://schema.org/Product">
        <img id="bigpic" src="https://www.drivezeclerc.re/portail-st-leu/{product_id}-large_default/p.jpg">
        <h1 class="product-name">Produit {product_id} {package}</h1>
        {brand_html}
        <input type="hidden" name="id_product" value="{product_id}">
        <p itemprop="offers"><link itemprop="availability" href="https://schema.org/{availability}">
          <span itemprop="price" content="{price:.2f}">{price:.2f} €</span>
        </p>
        {old_price_html}
        <strong>{unit_price}</strong>
        <div class="rte"><h4>Poids net :</h4>{package}<br><h4>Conservation :</h4>Au sec</div>
      </div>
      <script>
        var id_product={product_id};var productPrice={price:.2f};
        var productPriceWithoutReduction={(original_price or price):.2f};
        var productReference='{reference}';var product_specific_price={specific};
      </script>
    </body></html>
    """


def _category_html(product_ids: list[int]) -> str:
    return "<html><body>" + "".join(
        f'<a href="{_product_url(product_id)}">P{product_id}</a>'
        for product_id in product_ids
    ) + "</body></html>"


class _FakeFetcher:
    def __init__(self, details: dict[int, str], order: list[int] | None = None) -> None:
        self.details = details
        self.order = order or list(details)

    def fetch_text(self, url: str, *, allowed_hosts, settings) -> TextDocument:
        if url == ROOT_URL:
            text = f'<a href="{CATEGORY_URL}">Catégorie</a>'
        elif url == CATEGORY_URL:
            text = _category_html(self.order)
        else:
            product_id = int(Path(url.split("?", 1)[0]).name.split("-", 1)[0])
            text = self.details[product_id]
        return TextDocument(url=url, content_type="text/html", text=text)


class _Client:
    def __init__(self, existing: list[dict[str, object]] | None = None) -> None:
        self.existing = existing or []
        self.select_calls: list[tuple[str, object, str]] = []
        self.rpc_calls: list[tuple[str, object]] = []

    def select(self, table: str, *, filters=None, columns="*"):
        self.select_calls.append((table, filters, columns))
        if table == "retail_price_candidates":
            return self.existing
        return []

    def rpc(self, function_name: str, payload=None):
        self.rpc_calls.append((function_name, payload))
        return {"imported": len((payload or {}).get("p_items", [])), "needs_review": len((payload or {}).get("p_items", []))}


def _settings(name: str) -> Settings:
    root = Path(tempfile.gettempdir()) / "budgetkazpei-eleclerc-drive-tests" / name
    root.mkdir(parents=True, exist_ok=True)
    return Settings.from_env().with_overrides(report_path=root / "placeholder.json")


def _run(details: dict[int, str], name: str, order: list[int] | None = None):
    settings = _settings(name)
    return run_eleclerc_reunion_readonly(
        settings,
        fetcher=_FakeFetcher(details, order=order),
        max_products=len(details),
        report_path=settings.report_path.parent / "readonly.json",
    )


def _rows(report):
    return [item.to_dict() for item in report.observations if not item.is_duplicate]


class EleclercDriveReunionCollectorTests(unittest.TestCase):
    def test_a_id_product_is_stable_and_price_free(self):
        first = _run({634: _detail_html(634, price=2.07)}, "id-first")
        second = _run({634: _detail_html(634, price=1.99)}, "id-second")
        self.assertEqual(_rows(first)[0]["source_product_id"], "634")
        self.assertEqual(_rows(first)[0]["source_product_id"], _rows(second)[0]["source_product_id"])

    def test_b_id_shop_is_stable_separate_store_evidence(self):
        row = _rows(_run({634: _detail_html(634)}, "shop"))[0]
        self.assertEqual(row["store_slug"], "portail-st-leu")
        self.assertEqual(row["raw_evidence"]["store_source_id"], "6")

    def test_c_price_change_creates_new_commercial_state(self):
        baseline = _run({634: _detail_html(634, price=2.07)}, "price-baseline")
        changed = _run({634: _detail_html(634, price=1.97)}, "price-change")
        candidates, actions, errors = plan_eleclerc_incremental_observations(changed, _rows(baseline))
        self.assertEqual((len(candidates), actions[0].change_type, errors), (1, "price_change", []))

    def test_d_promotion_appears(self):
        normal = _run({634: _detail_html(634, price=2.07)}, "promo-normal")
        promo = _run(
            {634: _detail_html(634, price=1.0, original_price=2.07, promo_from="2026-08-22 16:00:00", promo_to="2026-09-05 15:59:00")},
            "promo-appears",
        )
        candidates, actions, _ = plan_eleclerc_incremental_observations(promo, _rows(normal))
        self.assertEqual((len(candidates), actions[0].change_type), (1, "new_promotion"))

    def test_e_promotion_disappears(self):
        promo = _run(
            {634: _detail_html(634, price=1.0, original_price=2.07, promo_from="2026-08-22 16:00:00", promo_to="2026-09-05 15:59:00")},
            "return-promo",
        )
        normal = _run({634: _detail_html(634, price=2.07)}, "return-normal")
        candidates, actions, _ = plan_eleclerc_incremental_observations(normal, _rows(promo))
        self.assertEqual((len(candidates), actions[0].change_type), (1, "return_to_normal"))

    def test_f_promotion_dates_change_legitimately(self):
        first = _run(
            {634: _detail_html(634, price=1.0, original_price=2.07, promo_from="2026-08-22 16:00:00", promo_to="2026-09-05 15:59:00")},
            "dates-first",
        )
        second = _run(
            {634: _detail_html(634, price=1.0, original_price=2.07, promo_from="2026-08-23 16:00:00", promo_to="2026-09-06 15:59:00")},
            "dates-second",
        )
        candidates, actions, _ = plan_eleclerc_incremental_observations(second, _rows(first))
        self.assertEqual((len(candidates), actions[0].change_type), (1, "other_commercial_change"))
        row = _rows(second)[0]
        self.assertEqual(row["starts_at"], "2026-08-23T16:00:00+04:00")

    def test_same_promotion_instants_in_utc_are_unchanged(self):
        report = _run(
            {634: _detail_html(634, price=1.0, original_price=2.07, promo_from="2026-08-22 16:00:00", promo_to="2026-09-05 15:59:00")},
            "dates-timezone-equivalence",
        )
        existing = _rows(report)[0]
        existing["starts_at"] = "2026-08-22T12:00:00+00:00"
        existing["ends_at"] = "2026-09-05T11:59:00+00:00"
        candidates, actions, errors = plan_eleclerc_incremental_observations(report, [existing])
        self.assertEqual((candidates, actions[0].change_type, errors), ([], "unchanged", []))

    def test_g_stock_alone_does_not_create_price_history(self):
        available = _run({634: _detail_html(634, availability="InStock")}, "stock-in")
        unavailable = _run({634: _detail_html(634, availability="OutOfStock")}, "stock-out")
        candidates, actions, _ = plan_eleclerc_incremental_observations(unavailable, _rows(available))
        self.assertEqual((candidates, actions[0].change_type), ([], "unchanged"))

    def test_h_dom_order_does_not_change_stable_signature(self):
        details = {634: _detail_html(634), 635: _detail_html(635)}
        first = _run(details, "order-first", [634, 635])
        second = _run(details, "order-second", [635, 634])
        self.assertEqual(stable_readonly_signature(first), stable_readonly_signature(second))

    def test_i_package_change_alone_does_not_create_price_history(self):
        first = _run({634: _detail_html(634, package="100g")}, "package-first")
        second = _run({634: _detail_html(634, package="0.1kg")}, "package-second")
        candidates, actions, _ = plan_eleclerc_incremental_observations(second, _rows(first))
        self.assertEqual((candidates, actions[0].change_type), ([], "unchanged"))

    def test_j_ean13_checksum(self):
        self.assertTrue(is_valid_ean13("3168930000983"))
        self.assertFalse(is_valid_ean13("3168930000984"))

    def test_k_invalid_reference_is_preserved_without_barcode_trust(self):
        row = _rows(_run({634: _detail_html(634, reference="3168930000984")}, "bad-ref"))[0]
        self.assertIsNone(row["barcode"])
        self.assertEqual(row["raw_evidence"]["source_reference"], "3168930000984")
        self.assertNotIn("source_reference_not_valid_ean13", row["validation_errors"])
        self.assertIn("source_reference_not_valid_ean13", row["match_warnings"])

    def test_l_unit_price_is_parsed(self):
        row = _rows(_run({634: _detail_html(634, unit_price="24.35 € / kg")}, "unit-price"))[0]
        self.assertEqual((row["unit_price"], row["unit_price_unit"]), (24.35, "kg"))

    def test_m_missing_brand_remains_collectable_and_reviewable(self):
        row = _rows(_run({634: _detail_html(634, brand=None)}, "brand-missing"))[0]
        self.assertIsNone(row["brand"])
        self.assertEqual(row["source_product_id"], "634")
        self.assertIn("missing_brand", row["match_warnings"])

    def test_n_second_readonly_is_identical(self):
        details = {634: _detail_html(634), 635: _detail_html(635)}
        self.assertEqual(
            stable_readonly_signature(_run(details, "repeat-first")),
            stable_readonly_signature(_run(details, "repeat-second")),
        )

    def test_o_dry_run_reads_supabase_and_never_publishes(self):
        settings = _settings("dry-run")
        client = _Client()
        report = run_eleclerc_reunion_incremental(
            settings,
            fetcher=_FakeFetcher({634: _detail_html(634)}),
            dry_run=True,
            max_products=1,
            client=client,
            report_path=settings.report_path.parent / "incremental.json",
        )
        self.assertEqual(report.baseline_source, "supabase")
        self.assertEqual(client.rpc_calls, [])
        self.assertEqual(client.select_calls[0][0], "retail_price_candidates")
        self.assertFalse(report.to_dict()["automatic_publication"])
        self.assertTrue(all(not value for value in report.to_dict()["writes"].values()))

    def test_real_mode_targets_staging_rpc_only_and_forces_review_warning(self):
        settings = _settings("real-staging")
        client = _Client()
        report = run_eleclerc_reunion_incremental(
            settings,
            fetcher=_FakeFetcher({634: _detail_html(634)}),
            dry_run=False,
            max_products=1,
            client=client,
            existing_rows=[],
            report_path=settings.report_path.parent / "incremental.json",
        )
        self.assertEqual([call[0] for call in client.rpc_calls], ["retail_import_price_candidates"])
        item = client.rpc_calls[0][1]["p_items"][0]
        self.assertIn("human_validation_required", item["match_warnings"])
        self.assertEqual(item["store_city"], "Saint-Leu")
        self.assertFalse(report.to_dict()["automatic_publication"])

    def test_only_pilot_store_is_allowed(self):
        settings = _settings("store-guard")
        with self.assertRaisesRegex(ValueError, "pilot_allows_only_portail-st-leu"):
            run_eleclerc_reunion_readonly(
                settings,
                fetcher=_FakeFetcher({634: _detail_html(634)}),
                store_slug="st-benoit",
                max_products=1,
            )

    def test_parser_uses_structured_promotion_shop_and_dates(self):
        page = parse_product_page(
            _detail_html(
                7898,
                price=1.0,
                original_price=2.01,
                promo_from="2026-08-22 16:00:00",
                promo_to="2026-09-05 15:59:00",
            ),
            _product_url(7898),
            PILOT_STORE,
        )
        item = build_eleclerc_observation(page, observed_at="2026-09-02T00:00:00Z")
        self.assertTrue(item.promotion_proven)
        self.assertEqual(item.offer_mechanism, "direct_discount")
        self.assertEqual(item.raw_evidence["specific_price"]["id_shop"], "6")
        self.assertEqual((item.current_price, item.original_price), (1.0, 2.01))
        self.assertEqual((item.starts_at, item.ends_at), ("2026-08-22T16:00:00+04:00", "2026-09-05T15:59:00+04:00"))


if __name__ == "__main__":
    unittest.main()
