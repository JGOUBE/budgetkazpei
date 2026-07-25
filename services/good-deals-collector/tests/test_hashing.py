import unittest

from app.services.hashing import sha256_json, sha256_text


class HashingTests(unittest.TestCase):
    def test_sha256_text_is_stable(self):
        self.assertEqual(sha256_text("BudgetKazPei"), sha256_text("BudgetKazPei"))

    def test_sha256_json_is_canonical(self):
        left = {"b": 2, "a": 1}
        right = {"a": 1, "b": 2}
        self.assertEqual(sha256_json(left), sha256_json(right))


if __name__ == "__main__":
    unittest.main()
