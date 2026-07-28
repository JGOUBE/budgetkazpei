from datetime import datetime
import unittest

from app.collectors.eleclerc_reunion import CatalogReference
from app.extractors.catalog_page_regions import PageRegion
from app.extractors.catalog_product_ocr import OcrLine
from app.models.promotion_candidate import BoundingBox
from app.services.promotion_scoring import extract_promotion_candidates


CATALOG = CatalogReference(
    catalog_slug="26runRDC",
    title="Rentrée des classes",
    viewer_url="https://www.e-leclerc.re/public/catalogues/26runRDC",
    period_text="Catalogue E.Leclerc du lundi 20 juillet 2026 au dimanche 2 août 2026",
    starts_at=datetime(2026, 7, 20),
    ends_at=datetime(2026, 8, 2),
)


def _line(index: int, text: str, top: float) -> OcrLine:
    return OcrLine(
        id=index,
        text=text,
        score=0.96,
        bounding_box=BoundingBox(left=40, top=top, width=220, height=28),
        fragments=[text],
    )


def _region(region_id: str, *lines: str) -> PageRegion:
    objects = [_line(index, text, 80 + (index * 36)) for index, text in enumerate(lines)]
    box = objects[0].bounding_box
    for line in objects[1:]:
        box = box.union(line.bounding_box)
    return PageRegion(
        page_number=1,
        region_id=region_id,
        bounding_box=box,
        lines=objects,
        column_index=0,
    )


class PromotionScoringTests(unittest.TestCase):
    def test_simple_price_offer(self):
        candidate = extract_promotion_candidates([_region("r1", "YAOURT NATURE 4x125 g", "2,99")], catalog=CATALOG)[0]
        self.assertEqual(candidate.offer_mechanism, "simple_price")
        self.assertEqual(candidate.promo_price, 2.99)
        self.assertEqual(candidate.package_format.lower(), "4x125 g")

    def test_original_price_and_promo_price(self):
        candidate = extract_promotion_candidates([_region("r2", "CAFE MOULU 250 g", "6,49 ancien prix", "4,99")], catalog=CATALOG)[0]
        self.assertEqual(candidate.offer_mechanism, "direct_discount")
        self.assertEqual(candidate.original_price, 6.49)
        self.assertEqual(candidate.promo_price, 4.99)

    def test_loyalty_credit_is_not_used_as_promo_price(self):
        candidate = extract_promotion_candidates([_region("r3", "THON LISTAO 140 g", "5,99", "1,50 ticket E.Leclerc")], catalog=CATALOG)[0]
        self.assertEqual(candidate.offer_mechanism, "loyalty_credit")
        self.assertEqual(candidate.promo_price, 5.99)
        self.assertEqual(candidate.loyalty_amount, 1.50)

    def test_multi_buy_offer(self):
        candidate = extract_promotion_candidates([_region("r4", "EAU MINERALE 6x1,5 l", "3 pour 5,00")], catalog=CATALOG)[0]
        self.assertEqual(candidate.offer_mechanism, "multi_buy")
        self.assertEqual(candidate.promo_price, 5.0)

    def test_second_item_discount(self):
        candidate = extract_promotion_candidates([_region("r5", "SHAMPOING 250 ml", "4,99", "2eme a -68%")], catalog=CATALOG)[0]
        self.assertEqual(candidate.offer_mechanism, "second_item_discount")
        self.assertEqual(candidate.discount_percent, 68.0)

    def test_unit_price_extracted(self):
        candidate = extract_promotion_candidates([_region("r6", "POMMES DE TERRE 2 kg", "3,99", "1,99 / kg")], catalog=CATALOG)[0]
        self.assertEqual(candidate.unit_price, 1.99)
        self.assertEqual(candidate.unit_price_unit, "kg")

    def test_starting_from_offer_stays_low_confidence(self):
        candidate = extract_promotion_candidates([_region("r7", "CHAISES DE BUREAU", "A partir de 29,90")], catalog=CATALOG)[0]
        self.assertEqual(candidate.offer_mechanism, "starting_from")
        self.assertIn("starting_from_offer", candidate.validation_errors)
        self.assertLess(candidate.extraction_confidence, 85)

    def test_ambiguous_offer_stays_in_review(self):
        candidate = extract_promotion_candidates([_region("r8", "ASSORTIMENT BISCUITS 250 g", "2,99", "3,49")], catalog=CATALOG)[0]
        self.assertIn("ambiguous_multiple_prices", candidate.validation_errors)
        self.assertEqual(candidate.candidate_status, "needs_review")

    def test_incorrect_product_price_association_is_refused(self):
        candidate = extract_promotion_candidates(
            [_region("r9", "YAOURT VANILLE 4x125 g", "BISCUITS CHOCOLAT 200 g", "2,99", "3,49")],
            catalog=CATALOG,
        )[0]
        self.assertIn("multiple_products_in_region", candidate.validation_errors)
        self.assertIn(candidate.candidate_status, {"needs_review", "rejected"})


if __name__ == "__main__":
    unittest.main()
