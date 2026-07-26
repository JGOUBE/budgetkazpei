FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV COLLECTOR_MODE=full
ENV COLLECTOR_DRY_RUN=true
ENV COLLECTOR_TIMEZONE=Indian/Reunion
ENV COLLECTOR_OCR_ENABLED=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/sbin/nologin collector

COPY pyproject.toml requirements.txt ./

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN chown -R collector:collector /app

USER collector

CMD ["python", "-m", "app.main"]