# syntax=docker/dockerfile:1
# MealDeal's OCR service: PP-OCRv6 medium (PaddleOCR) behind a small HTTP wrapper. CPU only, and
# built for linux/amd64: oneDNN, which makes Paddle's CPU inference fast, is x86-only. See README.md.

FROM python:3.12.16-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df

# OpenCV (pulled in by PaddleX) loads libGL and GLib even headless; Paddle needs OpenMP.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# --no-deps: requirements.txt is the whole set, so nothing unpinned can slip in; pip check
# fails the build if the set is ever incomplete.
RUN pip install --no-cache-dir --no-deps --root-user-action=ignore --disable-pip-version-check \
    -r requirements.txt \
  && pip check

COPY server.py .

RUN useradd --create-home --uid 10001 ocr && mkdir /models && chown ocr /models
USER ocr

# Models download into /models on first start (~160 MB) and are read from there afterwards, so
# mount a volume on it. The source check would otherwise probe every model host at each start.
ENV PYTHONUNBUFFERED=1 \
    PADDLE_PDX_CACHE_HOME=/models \
    PADDLE_PDX_MODEL_SOURCE=huggingface \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
VOLUME ["/models"]
EXPOSE 8866
CMD ["python", "server.py"]
