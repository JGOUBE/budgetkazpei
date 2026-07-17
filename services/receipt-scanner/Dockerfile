FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.lock ./
RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.lock

COPY receipt_scanner ./receipt_scanner
COPY scripts ./scripts
COPY tests ./tests

CMD ["python", "-m", "receipt_scanner"]
