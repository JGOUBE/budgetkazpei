FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip uninstall -y opencv-python \
    && python -m pip install --no-cache-dir --force-reinstall --no-deps opencv-python-headless==5.0.0.93

COPY app ./app

CMD ["python", "-m", "app.main"]
