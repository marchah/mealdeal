"""PP-OCRv6 medium over HTTP, for MealDeal's receipt import (docs/PLAN.md, v3 slice 1).

POST /ocr     one photo as the raw request body, Content-Type image/*
              200 {"engine": str, "seconds": float,
                   "boxes": [{"text": str, "score": float, "box": [x1, y1, x2, y2]}]}
GET  /health  200 {"status": "ok", "engine": str} -- the models are loaded before it listens

Errors answer {"error": str}. Boxes come back as the engine read them; rebuilding printed rows
from them is MealDeal's job (third-party/paddleocr/service.ts), so this stays a thin wrapper.
"""

import json
import logging
import os
import signal
import time
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
import paddleocr
from paddleocr import PaddleOCR

PORT = 8866
TIER = "medium"
ENGINE = f"PP-OCRv6_{TIER} (paddleocr {paddleocr.__version__})"
# MealDeal's adapter refuses larger photos before sending them.
MAX_IMAGE_BYTES = 25 * 1024 * 1024
CPU_THREADS = int(os.environ.get("OCR_CPU_THREADS") or len(os.sched_getaffinity(0)))

# Warnings only from the libraries: at INFO, the model download logs every HTTP request.
logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ocr")
log.setLevel(logging.INFO)

# Served from a new thread per request, the second request fails inside Paddle ("std::exception").
# So the engine is built and run on one thread of its own, which also reads one photo at a time,
# and the HTTP threads only queue work for it -- /health keeps answering while a photo is read.
engine_thread = ThreadPoolExecutor(max_workers=1, thread_name_prefix="paddle")


def load_engine():
    # The spike's configuration (docs/PLAN.md slice 0): detection and recognition only.
    return PaddleOCR(
        text_detection_model_name=f"PP-OCRv6_{TIER}_det",
        text_recognition_model_name=f"PP-OCRv6_{TIER}_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        cpu_threads=CPU_THREADS,
    )


ocr = engine_thread.submit(load_engine).result()


def predict(image):
    started = time.perf_counter()
    result = ocr.predict(image)[0]
    boxes = [
        {"text": text, "score": round(float(score), 4), "box": [int(v) for v in box]}
        for text, score, box in zip(result["rec_texts"], result["rec_scores"], result["rec_boxes"])
    ]
    return boxes, round(time.perf_counter() - started, 2)


def read_boxes(image):
    """The image's text boxes and the seconds spent reading them, not counting the queue."""
    return engine_thread.submit(predict, image).result()


class Handler(BaseHTTPRequestHandler):
    # A client that stops sending half-way must not hold a thread forever.
    timeout = 120

    def send_json(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        self.send_json(HTTPStatus.OK, {"status": "ok", "engine": ENGINE})

    def do_POST(self):
        if self.path != "/ocr":
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("image/"):
            return self.send_json(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "send one image as the body"}
            )
        length = self.headers.get("Content-Length")
        if length is None or not length.isdigit():
            return self.send_json(HTTPStatus.LENGTH_REQUIRED, {"error": "Content-Length required"})
        if int(length) > MAX_IMAGE_BYTES:
            return self.send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"error": f"image is over {MAX_IMAGE_BYTES // (1024 * 1024)} MB"},
            )
        body = self.rfile.read(int(length))
        # The same decode the spike's file path went through (paddlex's OpenCV image reader).
        image = cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            return self.send_json(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "not an image this service can decode"}
            )
        try:
            boxes, seconds = read_boxes(image)
        except Exception as error:
            log.exception("OCR failed")
            return self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
        height, width = image.shape[:2]
        log.info("read %d boxes from a %dx%d photo in %.2fs", len(boxes), width, height, seconds)
        self.send_json(HTTPStatus.OK, {"engine": ENGINE, "seconds": seconds, "boxes": boxes})

    def log_message(self, format, *args):
        # No path yet when the request line itself was malformed.
        if getattr(self, "path", "") != "/health":
            log.info("%s %s", self.address_string(), format % args)


def main():
    # Proves the engine runs before anything reports it healthy.
    read_boxes(np.full((64, 256, 3), 255, np.uint8))
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    # PID 1 in a container ignores SIGTERM unless it handles it.
    signal.signal(signal.SIGTERM, signal.default_int_handler)
    log.info("%s listening on :%d with %d CPU threads", ENGINE, PORT, CPU_THREADS)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
