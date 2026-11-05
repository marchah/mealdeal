import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcrServiceError, ValidationError } from '../../common/errors';
import { paddleocrAdapterFactory } from './adapter';

const config = { OCR_BASE_URL: 'http://ocr.example.test:8866', OCR_TIMEOUT_SECONDS: 300 };

const PAGE = {
  engine: 'PP-OCRv6_medium (paddleocr 3.7.0)',
  seconds: 13.4,
  boxes: [{ text: '356419 Mangoes', score: 0.9774, box: [861, 1837, 1369, 1906] }],
};

const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), contentType: 'image/jpeg' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(answer: (url: URL, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('paddleocrAdapter', () => {
  it("posts the photo's bytes with its content type and returns the boxes", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(PAGE)));

    await expect(paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo)).resolves.toEqual(
      PAGE,
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url?.href).toBe('http://ocr.example.test:8866/ocr');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'content-type': 'image/jpeg' });
    expect(init?.body).toEqual(photo.bytes);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps a path on the base URL, with or without a trailing slash', async () => {
    for (const base of [
      'http://lan.example.test/ocr-service',
      'http://lan.example.test/ocr-service/',
    ]) {
      const fetchMock = stubFetch(() => Promise.resolve(json(PAGE)));
      await paddleocrAdapterFactory({
        config: { ...config, OCR_BASE_URL: base },
      }).readPhotoTextBoxes(photo);
      expect(fetchMock.mock.calls[0]?.[0].href).toBe('http://lan.example.test/ocr-service/ocr');
    }
  });

  it('gives up on a service that does not answer in time', async () => {
    // Answers only when the request's own signal aborts — the way fetch behaves.
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          // AbortSignal.timeout's reason is a DOMException named TimeoutError.
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        }),
    );
    const adapter = paddleocrAdapterFactory({ config: { ...config, OCR_TIMEOUT_SECONDS: 0.05 } });

    const read = adapter.readPhotoTextBoxes(photo);

    await expect(read).rejects.toBeInstanceOf(OcrServiceError);
    await expect(read).rejects.toThrow('OCR service did not answer within 0.05 s');
  });

  it('refuses a response it says is over the cap, without reading it', async () => {
    const body = new ReadableStream<Uint8Array>({ pull: () => undefined });
    stubFetch(() =>
      Promise.resolve(
        new Response(body, { headers: { 'content-length': String(3 * 1024 * 1024) } }),
      ),
    );

    await expect(paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo)).rejects.toThrow(
      'OCR service response is over 2097152 bytes',
    );
  });

  it('stops reading a response that runs past the cap', async () => {
    // No content-length: the cap has to hold while streaming.
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(512 * 1024).fill(0x20));
        if (sent === 10) controller.close();
      },
    });
    stubFetch(() => Promise.resolve(new Response(body)));

    await expect(paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo)).rejects.toThrow(
      'OCR service response is over 2097152 bytes',
    );
    expect(sent).toBeLessThan(10);
  });

  it('rejects a response that is not the expected shape', async () => {
    const malformed: unknown[] = [
      { ...PAGE, engine: undefined },
      { ...PAGE, boxes: undefined },
      { ...PAGE, boxes: [{ ...PAGE.boxes[0], score: 'high' }] },
      { ...PAGE, boxes: [{ ...PAGE.boxes[0], score: 1.5 }] },
      { ...PAGE, boxes: [{ ...PAGE.boxes[0], text: null }] },
      { ...PAGE, boxes: [{ ...PAGE.boxes[0], box: [861, 1837, 1369] }] },
      { ...PAGE, boxes: [{ ...PAGE.boxes[0], box: [1369, 1837, 861, 1906] }] },
      [PAGE],
    ];
    for (const body of malformed) {
      stubFetch(() => Promise.resolve(json(body)));
      await expect(
        paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo),
        JSON.stringify(body),
      ).rejects.toThrow('OCR service answered in an unexpected shape');
    }
  });

  it('rejects a response that is not JSON at all', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>Bad gateway</html>')));
    await expect(paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo)).rejects.toThrow(
      'OCR service answered with something that is not JSON',
    );
  });

  it("reports an error status with the service's own reason", async () => {
    stubFetch(() => Promise.resolve(json({ error: 'not an image this service can decode' }, 415)));
    await expect(paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo)).rejects.toThrow(
      'OCR service answered 415: not an image this service can decode',
    );
  });

  it('reports a service it cannot reach, with the reason Node keeps in the cause', async () => {
    const refused = new Error('connect ECONNREFUSED 192.0.2.10:8866');
    stubFetch(() => Promise.reject(new TypeError('fetch failed', { cause: refused })));
    const read = paddleocrAdapterFactory({ config }).readPhotoTextBoxes(photo);
    await expect(read).rejects.toBeInstanceOf(OcrServiceError);
    await expect(read).rejects.toThrow(
      'OCR service request failed: fetch failed (connect ECONNREFUSED 192.0.2.10:8866)',
    );
  });

  it('refuses a photo over the request cap without sending it', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(json(PAGE)));
    const huge = { bytes: new Uint8Array(25 * 1024 * 1024 + 1), contentType: 'image/jpeg' };

    await expect(
      paddleocrAdapterFactory({ config }).readPhotoTextBoxes(huge),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
