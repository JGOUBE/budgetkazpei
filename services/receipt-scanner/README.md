# BudgetKazPei receipt scanner service

This folder contains the transferred Python scanner engine selected during
Step 2. It is intentionally isolated from the existing React/Supabase scanner.

## Current scope

Included:

- image preprocessing;
- RapidOCR / ONNX Runtime wrapper;
- OCR geometry types;
- line reconstruction;
- column detection;
- French receipt parsing;
- quality decision gate;
- ordered two-or-three-photo long receipt merge pipeline.
- FastAPI wrapper with `/health`, `/ready`, `/scan/single` and
  `/scan/long-receipt`.
- Supabase JWT authentication and server-side scan quota reservation via RPC.

Excluded for this step:

- lab virtual environments;
- `input/`, `output/`, real receipt photos, logs and one-off diagnostics.

The service exposes the API contract only. It does not persist receipt photos,
transactions, Courses intelligentes data or anonymized market rows.

## Local setup

```powershell
cd services\receipt-scanner
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m receipt_scanner
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe scripts\import_without_ocr_models.py
.\.venv\Scripts\python.exe -c "from receipt_scanner.api.app import app; print(app.title)"
```

The smoke test creates a synthetic temporary image. It does not use private
receipt photos.

## API

Local development can disable authentication explicitly:

```powershell
$env:RECEIPT_SCANNER_AUTH_MODE="disabled"
uvicorn receipt_scanner.api.app:app --host 127.0.0.1 --port 8080
```

Production must not use disabled authentication. Configure:

- `ENV=production`
- `RECEIPT_SCANNER_AUTH_MODE=required`
- `RECEIPT_SCANNER_SUPABASE_URL=https://<project-ref>.supabase.co`
- `RECEIPT_SCANNER_SUPABASE_ANON_KEY=<anon-key>`
- `RECEIPT_SCANNER_EXPECTED_AUDIENCE=authenticated`
- `RECEIPT_SCANNER_EXPECTED_ISSUER=https://<project-ref>.supabase.co/auth/v1`

The verifier supports both Supabase signing systems:

- legacy `HS256`, only when `RECEIPT_SCANNER_SUPABASE_JWT_SECRET` is set;
- asymmetric `RS256`/`ES256`, using the project JWKS endpoint.

JWKS configuration:

- `RECEIPT_SCANNER_SUPABASE_JWKS_URL` is optional and defaults to
  `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`;
- `RECEIPT_SCANNER_JWKS_CACHE_TTL_SECONDS=600` by default.

The verifier reads the JWT header only to choose the verification path. It
rejects `alg=none`, unsupported algorithms, missing `kid` for asymmetric
tokens, wrong issuer, wrong audience, missing subject and missing role. It
never uses the legacy secret to validate asymmetric tokens and never fetches
JWKS to validate `HS256`.

Runtime guardrails:

- `RECEIPT_SCANNER_MAX_FILE_SIZE_MB=12`
- `RECEIPT_SCANNER_MAX_TOTAL_FILE_SIZE_MB=36`
- `RECEIPT_SCANNER_MAX_CONCURRENT_SCANS=1`
- `RECEIPT_SCANNER_BUSY_TIMEOUT_SECONDS=2`
- `RECEIPT_SCANNER_PROCESSING_TIMEOUT_SECONDS=180`
- `RECEIPT_SCANNER_DIAGNOSTICS_ENABLED=true`
- `RECEIPT_SCANNER_QUOTA_MODE=supabase`
- `RECEIPT_SCANNER_QUOTA_TIMEOUT_SECONDS=5`
- `RECEIPT_SCANNER_LOG_LEVEL=INFO`
- `RECEIPT_SCANNER_OCR_LOG_LEVEL=WARNING`

Production logs must remain sanitized: no JWT, Authorization header, full OCR
text, image payload, user email, or local filesystem path. Keep RapidOCR and
ONNX Runtime at `WARNING` or stricter outside controlled debug sessions.

Supported uploads are JPEG, PNG and WebP. The service validates both declared
MIME type and Pillow-decoded image format, then deletes all temporary files at
the end of each request.

### Server-side quota

When authentication is required, quota mode defaults to `supabase`. The API
uses the caller's Supabase access token to call three RPCs:

- `reserve_receipt_scan`;
- `complete_receipt_scan`;
- `release_receipt_scan`.

The local migration `supabase/migrations/202607180001_receipt_scan_server_quota.sql`
adds those RPCs plus a `receipt_scan_requests` idempotency table. It also
removes direct authenticated insert, update and delete privileges on
`scan_usage`, so browser DevTools cannot increment or reset quota rows
directly.

The optional `scan_id` multipart field is the idempotency key. Reusing the same
`scan_id` for the same user and scan type returns the same in-process response
and the Supabase reservation remains idempotent.

### Endpoints

- `GET /health`
- `GET /ready`
- `POST /scan/single` with multipart field `image`
- `POST /scan/long-receipt` with either the legacy multipart fields
  `top_image` + `bottom_image`, or two/three repeated `segments` fields in
  top-to-bottom order

Optional multipart text fields are `scan_id`, `locale` and `client_version`.
Responses use one canonical JSON shape for both scan modes and never include
local file paths, images, OCR boxes or secrets.

## Docker

```powershell
cd services\receipt-scanner
docker build -t budgetkazpei-receipt-scanner:local .
docker run --rm -p 8080:8080 --env RECEIPT_SCANNER_AUTH_MODE=disabled budgetkazpei-receipt-scanner:local
docker run --rm budgetkazpei-receipt-scanner:local python -m unittest discover -s tests
```

Docker is expected to run Uvicorn:

```powershell
uvicorn receipt_scanner.api.app:app --host 0.0.0.0 --port 8080
```

## Optional private integration fixtures

Private receipt photos must stay outside Git. To run the optional integration
checks against a local lab folder, set:

```powershell
$env:RECEIPT_SCANNER_PRIVATE_FIXTURES_DIR="<private-fixtures-dir>"
.\.venv\Scripts\python.exe scripts\run_private_integration_tests.py
```

When the environment variable is missing or the private files are absent, the
script exits successfully with a `skipped` status.

## Production notes

- Run this package in a Linux container.
- Keep temporary uploads in per-scan folders and remove them in `finally`.
- Keep the legacy BudgetKazPei scanner as fallback until a later validated
  integration step.
- Do not commit real receipt images, raw output folders, secrets or local
  virtual environments.
