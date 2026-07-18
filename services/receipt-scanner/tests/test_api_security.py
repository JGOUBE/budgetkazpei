from __future__ import annotations

import json
import time
import unittest

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from receipt_scanner.api.errors import ScannerApiError
from receipt_scanner.api.security import SupabaseJwtVerifier
from receipt_scanner.api.settings import ScannerSettings


ISSUER = "https://project-ref.supabase.co/auth/v1"
AUDIENCE = "authenticated"


def settings(**overrides) -> ScannerSettings:
    values = {
        "auth_mode": "required",
        "supabase_url": "https://project-ref.supabase.co",
        "expected_audience": AUDIENCE,
    }
    values.update(overrides)
    return ScannerSettings(**values)


def payload(**overrides) -> dict[str, object]:
    values = {
        "sub": "user-123",
        "role": "authenticated",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "exp": int(time.time()) + 60,
    }
    values.update(overrides)
    return values


def rsa_key_pair() -> tuple[object, dict[str, object]]:
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    public_jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update(
        {
            "kid": "rsa-key-1",
            "alg": "RS256",
            "use": "sig",
            "key_ops": ["verify"],
        }
    )
    return private_key, public_jwk


class ApiSecurityTest(unittest.TestCase):
    def test_disabled_auth_mode_is_explicit(self) -> None:
        verifier = SupabaseJwtVerifier(ScannerSettings(auth_mode="disabled"))
        user = verifier.verify_authorization(None)
        self.assertEqual(user.user_id, "local-dev")

    def test_missing_authentication_is_rejected(self) -> None:
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_required"):
            verifier.verify_authorization(None)

    def test_invalid_authentication_is_rejected(self) -> None:
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_invalid"):
            verifier.verify_authorization("Bearer bad-token")

    def test_valid_legacy_hs256_token(self) -> None:
        token = jwt.encode(payload(), "secret", algorithm="HS256")
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        user = verifier.verify_authorization(f"Bearer {token}")
        self.assertEqual(user.user_id, "user-123")
        self.assertEqual(user.role, "authenticated")

    def test_hs256_requires_legacy_secret_and_never_fetches_jwks(self) -> None:
        token = jwt.encode(payload(), "secret", algorithm="HS256")
        calls: list[str] = []
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret=None),
            jwks_fetcher=lambda url: calls.append(url) or {"keys": []},
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_invalid"):
            verifier.verify_authorization(f"Bearer {token}")
        self.assertEqual(calls, [])

    def test_valid_rs256_token_from_jwks(self) -> None:
        private_key, jwk = rsa_key_pair()
        token = jwt.encode(
            payload(),
            private_key,
            algorithm="RS256",
            headers={"kid": "rsa-key-1"},
        )
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret=None),
            jwks_fetcher=lambda _url: {"keys": [jwk]},
        )
        user = verifier.verify_authorization(f"Bearer {token}")
        self.assertEqual(user.user_id, "user-123")
        self.assertEqual(user.role, "authenticated")

    def test_unknown_kid_refreshes_jwks_cache(self) -> None:
        private_key, jwk = rsa_key_pair()
        token = jwt.encode(
            payload(),
            private_key,
            algorithm="RS256",
            headers={"kid": "rsa-key-1"},
        )
        responses = [{"keys": []}, {"keys": [jwk]}]
        calls: list[str] = []

        def fetcher(url: str) -> dict[str, object]:
            calls.append(url)
            return responses.pop(0)

        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret=None),
            jwks_fetcher=fetcher,
        )
        user = verifier.verify_authorization(f"Bearer {token}")
        self.assertEqual(user.user_id, "user-123")
        self.assertEqual(len(calls), 2)

    def test_rejects_alg_none(self) -> None:
        token = jwt.encode(payload(), key="", algorithm="none")
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_invalid"):
            verifier.verify_authorization(f"Bearer {token}")

    def test_rejects_wrong_audience(self) -> None:
        token = jwt.encode(
            payload(aud="other"),
            "secret",
            algorithm="HS256",
        )
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_invalid"):
            verifier.verify_authorization(f"Bearer {token}")

    def test_rejects_wrong_issuer(self) -> None:
        token = jwt.encode(
            payload(iss="https://other.supabase.co/auth/v1"),
            "secret",
            algorithm="HS256",
        )
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_invalid"):
            verifier.verify_authorization(f"Bearer {token}")

    def test_rejects_missing_role(self) -> None:
        claims = payload()
        claims.pop("role")
        token = jwt.encode(claims, "secret", algorithm="HS256")
        verifier = SupabaseJwtVerifier(
            settings(supabase_jwt_secret="secret")
        )
        with self.assertRaisesRegex(ScannerApiError, "authentication_invalid"):
            verifier.verify_authorization(f"Bearer {token}")

    def test_disabled_auth_is_rejected_in_production_validation(self) -> None:
        with self.assertRaises(RuntimeError):
            ScannerSettings(env="production", auth_mode="disabled").validate()

    def test_jwks_only_configuration_is_valid_without_legacy_secret(self) -> None:
        ScannerSettings(
            auth_mode="required",
            supabase_url="https://project-ref.supabase.co",
            supabase_jwt_secret=None,
        ).validate()


if __name__ == "__main__":
    unittest.main()
