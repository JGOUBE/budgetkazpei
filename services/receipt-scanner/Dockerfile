FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV RECEIPT_SCANNER_AUTH_MODE=required
ENV RECEIPT_SCANNER_MAX_CONCURRENT_SCANS=1
ENV RECEIPT_SCANNER_PROCESSING_TIMEOUT_SECONDS=90

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/sbin/nologin scanner

COPY pyproject.toml requirements.lock ./

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.lock \
    && python -m pip uninstall -y opencv-python \
    && python -m pip install --no-cache-dir --force-reinstall --no-deps opencv-python-headless==5.0.0.93

COPY receipt_scanner ./receipt_scanner
COPY scripts ./scripts
COPY tests ./tests

RUN chown -R scanner:scanner /app

USER scanner

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3).read()"]

CMD ["uvicorn", "receipt_scanner.api.app:app", "--host", "0.0.0.0", "--port", "8080"]
