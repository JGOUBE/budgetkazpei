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

Excluded for this step:

- FastAPI scan endpoints;
- React integration;
- Supabase writes or migrations;
- lab virtual environments;
- `input/`, `output/`, real receipt photos, logs and one-off diagnostics.

The final FastAPI API contract belongs to Step 4. The only executable entry
point in this step is a synthetic smoke test.

## Local setup

```powershell
cd services\receipt-scanner
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m receipt_scanner
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe scripts\import_without_ocr_models.py
```

The smoke test creates a synthetic temporary image. It does not use private
receipt photos.

## Docker

```powershell
cd services\receipt-scanner
docker build -t budgetkazpei-receipt-scanner:local .
docker run --rm budgetkazpei-receipt-scanner:local
docker run --rm budgetkazpei-receipt-scanner:local python -m unittest discover -s tests
```

## Optional private integration fixtures

Private receipt photos must stay outside Git. To run the optional integration
checks against a local lab folder, set:

```powershell
$env:RECEIPT_SCANNER_PRIVATE_FIXTURES_DIR="C:\path\to\private-fixtures"
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
