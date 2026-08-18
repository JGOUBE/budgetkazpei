from __future__ import annotations

from fastapi import Depends, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .dependencies import get_scan_service, require_user
from .errors import ScannerApiError, scanner_error_handler, unhandled_error_handler
from .logging_config import configure_logging
from .schemas import ErrorResponse, HealthResponse, ReadyResponse, ScanResponse
from .security import AuthenticatedUser, SupabaseJwtVerifier
from .settings import ScannerSettings, load_settings
from ..service import ReceiptScanService, ScanUpload


def create_app(
    *,
    settings: ScannerSettings | None = None,
    scan_service: ReceiptScanService | None = None,
) -> FastAPI:
    resolved_settings = settings or load_settings(validate=False)
    configure_logging(resolved_settings)

    app = FastAPI(
        title="BudgetKazPei Receipt Scanner API",
        version="0.1.0",
        description=(
            "Isolated FastAPI wrapper around the Python receipt scanner engine. "
            "This service does not write to Supabase."
        ),
    )

    # Autorise le frontend de production BudgetKazPei et les origines locales
    # utilisées pour les tests. Le JWT Supabase reste envoyé dans Authorization.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://budgetkazpei.re",
            "https://www.budgetkazpei.re",
            "https://budgetkazpei.vercel.app",
            "http://localhost:5175",
            "http://127.0.0.1:5175",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=False,
        allow_methods=[
            "GET",
            "POST",
            "OPTIONS",
        ],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
        ],
        max_age=600,
    )

    app.add_exception_handler(ScannerApiError, scanner_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.state.settings = resolved_settings
    app.state.scan_service = scan_service or ReceiptScanService(
        settings=resolved_settings
    )
    app.state.auth_verifier = SupabaseJwtVerifier(resolved_settings)

    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["health"],
        summary="Service health",
        description="Returns basic service health without loading OCR models.",
    )
    async def health() -> HealthResponse:
        return HealthResponse(
            model_loaded=bool(app.state.scan_service.model_loaded),
        )

    @app.get(
        "/ready",
        response_model=ReadyResponse,
        tags=["health"],
        summary="Service readiness",
        description="Returns readiness and local runtime guard configuration.",
    )
    async def ready() -> ReadyResponse:
        return ReadyResponse(
            model_loaded=bool(app.state.scan_service.model_loaded),
            ready=not resolved_settings.auth_disabled_in_production,
            auth_mode=resolved_settings.auth_mode,
            quota_mode=resolved_settings.quota_mode,
            parser_mode=resolved_settings.parser_mode,
            max_concurrent_scans=resolved_settings.max_concurrent_scans,
            diagnostics_enabled=resolved_settings.diagnostics_enabled,
        )

    @app.post(
        "/scan/single",
        response_model=ScanResponse,
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            413: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            429: {"model": ErrorResponse},
            504: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
        },
        tags=["scan"],
        summary="Scan a single receipt photo",
        description="Scans one uploaded JPEG, PNG or WebP receipt image.",
    )
    async def scan_single(
        image: UploadFile = File(..., description="Receipt image"),
        scan_id: str | None = Form(default=None),
        locale: str | None = Form(default=None),
        client_version: str | None = Form(default=None),
        user: AuthenticatedUser = Depends(require_user),
        service: ReceiptScanService = Depends(get_scan_service),
    ) -> dict[str, object]:
        return await run_in_threadpool(
            service.scan_single,
            upload=ScanUpload(
                filename=image.filename,
                content_type=image.content_type,
                stream=image.file,
            ),
            user_id=user.user_id,
            access_token=user.access_token,
            scan_id=scan_id,
            locale=locale,
            client_version=client_version,
        )

    @app.post(
        "/scan/long-receipt",
        response_model=ScanResponse,
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            413: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            429: {"model": ErrorResponse},
            504: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
        },
        tags=["scan"],
        summary="Scan a long receipt from two or three photos",
        description=(
            "Accepts the legacy top_image + bottom_image contract or two/three "
            "ordered segments fields with visible textual overlaps."
        ),
    )
    async def scan_long_receipt(
        segments: list[UploadFile] | None = File(
            default=None,
            description="Two or three ordered receipt segments",
        ),
        top_image: UploadFile | None = File(
            default=None,
            description="Legacy top receipt image",
        ),
        bottom_image: UploadFile | None = File(
            default=None,
            description="Legacy bottom receipt image",
        ),
        scan_id: str | None = Form(default=None),
        locale: str | None = Form(default=None),
        client_version: str | None = Form(default=None),
        user: AuthenticatedUser = Depends(require_user),
        service: ReceiptScanService = Depends(get_scan_service),
    ) -> dict[str, object]:
        if segments:
            if top_image is not None or bottom_image is not None:
                raise ScannerApiError(code="invalid_file", retryable=False)
            if len(segments) not in {2, 3}:
                raise ScannerApiError(code="invalid_file", retryable=False)
            ordered_uploads = segments
        else:
            if top_image is None or bottom_image is None:
                raise ScannerApiError(code="invalid_file", retryable=False)
            ordered_uploads = [top_image, bottom_image]

        return await run_in_threadpool(
            service.scan_long_receipt,
            segment_uploads=[
                ScanUpload(
                    filename=image.filename,
                    content_type=image.content_type,
                    stream=image.file,
                )
                for image in ordered_uploads
            ],
            user_id=user.user_id,
            access_token=user.access_token,
            scan_id=scan_id,
            locale=locale,
            client_version=client_version,
        )

    return app


app = create_app()
