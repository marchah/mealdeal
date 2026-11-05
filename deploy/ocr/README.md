# MealDeal OCR service

PP-OCRv6 medium ([PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), Apache-2.0) over HTTP, for
receipt import. MealDeal sends one photo at a time and gets back every text box the engine found;
rebuilding the printed rows from the boxes happens in MealDeal
(`packages/api/src/third-party/paddleocr/service.ts`), so this container stays a thin wrapper and
another engine can replace it behind the same port.

It runs as its own stack rather than inside the MealDeal image: it is Python, ~1.7 GB, and needs
several gigabytes of memory while it reads a photo.

## API

| Request                                       | Answer                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `POST /ocr`, one image as the body, `image/*` | `200 {"engine", "seconds", "boxes": [{"text", "score", "box": [left, top, right, bottom]}]}` |
| `GET /health`                                 | `200 {"status": "ok", "engine"}` once the models are loaded                                  |

Errors answer `{"error": "…"}`: 404, 411 without a `Content-Length`, 413 over 25 MB, 415 for a body
that is not an image it can decode, 500 when the engine fails. Photos are read one at a time; a
second request waits for the first.

## Run it

```bash
docker compose -f deploy/ocr/compose.yaml up -d --build
curl -sS -H 'Content-Type: image/jpeg' --data-binary @receipt.jpg http://localhost:8866/ocr
```

As a Portainer git stack, point it at this repository with compose path `deploy/ocr/compose.yaml`
(the file's header has the fields). The image is built on the host from this folder; nothing is
published to a registry. Then set MealDeal's `OCR_BASE_URL` to `http://<this host>:8866`.

The first start downloads the two models (~130 MB, from Hugging Face) into the `ocr-models` volume
before it listens; later starts read them from there. There is no authentication: keep the port on
the LAN.

## What it needs

- **x86_64.** Paddle's fast CPU path, oneDNN, is x86-only, so the image is built for `linux/amd64`.
- **About 6 GB of free memory while it reads.** A 12 MP photo peaked at 5.6–6.0 GB in the container;
  it idles at ~0.6 GB after start and holds ~2.3 GB after its first photo. A host without that much
  headroom will have the container killed mid-read, and MealDeal will report the OCR as failed.
- **Time.** On slice 0's 12 MP photo: ~14 s with 10 threads and ~29 s with 4, under Rosetta on an
  M3 Max. `OCR_CPU_THREADS` sets the thread count (default: every core the container sees). More
  is not always faster: all 16 of that machine's cores took ~30 s, twice as long as 10.
  MealDeal waits `OCR_TIMEOUT_SECONDS` per photo (default 300).

## Why these pins

- **A small wrapper, not PaddleX's own serving.** PaddleX's server wants the photo as a base64
  string inside JSON, answers in its own result envelope, and adds a serving stack (FastAPI,
  uvicorn and more, via `paddlex --install serving`) plus a pipeline config file to the image.
  `server.py` is the standard library plus the engine: it takes the photo's bytes as they are and
  answers in the shape slice 0 recorded.
- **`paddlepaddle==3.2.2`.** 3.3.0 and 3.3.1 fail every inference on x86 with oneDNN on
  ([PaddlePaddle/Paddle#77340](https://github.com/PaddlePaddle/Paddle/issues/77340)); a fix is
  merged upstream but unreleased. Turning oneDNN off avoids it, but the same photo then needed more
  than the 5 GB the test container had (10 GB on the spike's Mac, which has no oneDNN), and the
  upstream thread reports it 3–6× slower. 3.2.2 reads slice 0's receipt box for box as the spike
  did: the same 99 boxes, text and coordinates, with scores within 0.0001.
- **The engine runs on one thread of its own.** With each request on its own HTTP thread, the
  second request failed inside Paddle (`RuntimeError: std::exception`); with every call on one
  thread, repeated and concurrent requests all read the receipt as the spike did.

`requirements.txt` pins every package. To move a version, edit `requirements.in`, then regenerate
the lock on the base image and rebuild:

```bash
docker run --rm --platform linux/amd64 -v "$PWD/deploy/ocr/requirements.in:/r.in:ro" \
  python:3.12.16-slim-bookworm sh -c 'pip install -q -r /r.in >/dev/null && pip freeze'
```

Paste the output under the header of `requirements.txt`, then check a real receipt still reads the
same before deploying.
