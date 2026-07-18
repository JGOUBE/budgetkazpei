from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


ERROR_HTTP_STATUS = {
    "invalid_file_type": 400,
    "invalid_image": 400,
    "image_dimensions_invalid": 400,
    "overlap_not_found": 400,
    "images_order_invalid": 400,
    "authentication_required": 401,
    "authentication_invalid": 401,
    "file_too_large": 413,
    "image_quality_failed": 422,
    "scan_not_exploitable": 422,
    "scanner_busy": 429,
    "quota_exceeded": 429,
    "monthly_quota_reached": 429,
    "scan_safety_limit_reached": 429,
    "quota_unavailable": 429,
    "processing_timeout": 504,
    "internal_scan_error": 500,
}

ERROR_MESSAGES = {
    "invalid_file_type": "Le fichier envoye n'est pas une image prise en charge.",
    "file_too_large": "Le fichier envoye depasse la taille maximale autorisee.",
    "invalid_image": "L'image envoyee ne peut pas etre decodee.",
    "image_dimensions_invalid": "Les dimensions de l'image ne sont pas acceptables.",
    "image_quality_failed": "La qualite de l'image ne permet pas une analyse fiable.",
    "scan_not_exploitable": "Le ticket n'est pas exploitable automatiquement.",
    "overlap_not_found": "Le chevauchement entre les deux photos est insuffisant.",
    "images_order_invalid": "Les deux photos semblent inversees ou incoherentes.",
    "scanner_busy": "Le scanner est temporairement occupe.",
    "quota_exceeded": "Votre quota de scans est atteint.",
    "monthly_quota_reached": "Votre quota de scans est atteint.",
    "scan_safety_limit_reached": (
        "Vous avez effectue un nombre inhabituel de scans ce mois-ci. "
        "Par securite, le scanner est temporairement limite. "
        "Contactez-nous si vous avez besoin de continuer."
    ),
    "quota_unavailable": "Le controle de quota est temporairement indisponible.",
    "processing_timeout": "Le traitement du ticket a depasse le delai maximal.",
    "authentication_required": "Une authentification est requise.",
    "authentication_invalid": "Le jeton d'authentification est invalide.",
    "internal_scan_error": "Une erreur interne est survenue pendant le scan.",
}


@dataclass(slots=True)
class ScannerApiError(Exception):
    code: str
    message: str | None = None
    retryable: bool = False
    scan_id: str | None = None
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.code

    @property
    def status_code(self) -> int:
        return ERROR_HTTP_STATUS.get(self.code, 500)

    def public_payload(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message or ERROR_MESSAGES.get(
                    self.code,
                    ERROR_MESSAGES["internal_scan_error"],
                ),
                "retryable": self.retryable,
                "scan_id": self.scan_id,
            }
        }


async def scanner_error_handler(
    _request: Request,
    exc: ScannerApiError,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.public_payload(),
    )


async def unhandled_error_handler(
    _request: Request,
    _exc: Exception,
) -> JSONResponse:
    error = ScannerApiError(code="internal_scan_error", retryable=True)
    return JSONResponse(status_code=500, content=error.public_payload())
