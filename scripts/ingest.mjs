const token = process.env.INGEST_TOKEN;
const url = process.env.INGEST_SERVER_URL ?? 'http://localhost:4000/internal/ingest';

if (!token) {
  console.error('INGEST_TOKEN is required. Set it to the token configured on the running server.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'x-ingest-token': token } });
    const body = await response.text();
    if (!response.ok) {
      console.error(
        `Ingest request failed (${String(response.status)}): ${body || response.statusText}`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write(`${body}\n`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Could not reach ingest server at ${url}: ${detail}`);
    process.exitCode = 1;
  }
}
