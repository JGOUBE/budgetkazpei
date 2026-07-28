from __future__ import annotations

import hashlib
from dataclasses import dataclass


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_text(payload: str) -> str:
    return sha256_bytes(payload.encode("utf-8"))


@dataclass(frozen=True)
class StreamHashResult:
    sha256: str
    size_bytes: int


def hash_chunks(chunks: list[bytes] | tuple[bytes, ...]) -> StreamHashResult:
    hasher = hashlib.sha256()
    total = 0
    for chunk in chunks:
        hasher.update(chunk)
        total += len(chunk)
    return StreamHashResult(sha256=hasher.hexdigest(), size_bytes=total)
