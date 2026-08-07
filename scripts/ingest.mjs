const token = process.env.INGEST_TOKEN;
const url = process.env.INGEST_SERVER_URL ?? 'http://localhost:4000/internal/ingest';

if (!token) {
  console.error('INGEST_TOKEN is required. Set it to the token configured on the running server.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'x-ingest-token': token } });
    const body = await response.text();
    if (response.status === 409) {
      console.error('A pass is already running; this request started nothing.');
      process.exitCode = 1;
    } else if (!response.ok) {
      console.error(
        `Ingest request failed (${String(response.status)}): ${body || response.statusText}`,
      );
      process.exitCode = 1;
    } else {
      // The server answers as soon as the pass STARTS, so there are no counts to print here.
      process.stdout.write(
        `${body}\nPass started; the server logs "pass complete" when it ends.\n`,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Could not reach ingest server at ${url}: ${detail}`);
    process.exitCode = 1;
  }
}
