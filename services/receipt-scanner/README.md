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
- two-photo long receipt merge pipeline.
- FastAPI wrapper with `/health`, `/ready`, `/scan/single` and
  `/scan/long-receipt`.

Excluded for this step:

- React integration;
- Supabase writes or migrations;
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
- `RECEIPT_SCANNER_MAX_TOTAL_FILE_SIZE_MB=24`
- `RECEIPT_SCANNER_MAX_CONCURRENT_SCANS=1`
- `RECEIPT_SCANNER_BUSY_TIMEOUT_SECONDS=2`
- `RECEIPT_SCANNER_PROCESSING_TIMEOUT_SECONDS=90`
- `RECEIPT_SCANNER_DIAGNOSTICS_ENABLED=true`

Supported uploads are JPEG, PNG and WebP. The service validates both declared
MIME type and Pillow-decoded image format, then deletes all temporary files at
the end of each request.

### Endpoints

- `GET /health`
- `GET /ready`
- `POST /scan/single` with multipart field `image`
- `POST /scan/long-receipt` with multipart fields `top_image` and
  `bottom_image`

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
