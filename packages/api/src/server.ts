import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createYoga } from 'graphql-yoga';
import sirv from 'sirv';
import { logException, logInfo } from './common/logger';
import { settings } from './common/settings';
import { createContext } from './context';
import { runMigrations } from './db/migrate';
import { getServices } from './services';
import { scheduleIngest, startIngestPass } from './ingest/run';
import { schema } from './schema';

// The built SPA. In Docker this is overridden to the copied build dir via WEB_DIR.
const WEB_DIR = settings.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname;

const yoga = createYoga({ schema, context: createContext, graphqlEndpoint: '/graphql' });
const serveStatic = sirv(WEB_DIR, { single: true, dev: false });

/**
 * Trigger a pass and answer immediately rather than holding the connection until it finishes.
 * A full batch routinely outlives Node's 300 s `server.requestTimeout`, which closed the socket
 * mid-pass and reported a transport failure for a pass that was in fact running fine — so the
 * outcome is logged (see startIngestPass) instead of returned.
 */
function handleInternalIngest(req: IncomingMessage, res: ServerResponse): void {
  const token = settings.INGEST_TOKEN;
  if (req.method !== 'POST' || !token || req.headers['x-ingest-token'] !== token) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  res.setHeader('content-type', 'application/json');
  if (!startIngestPass()) {
    res.statusCode = 409;
    res.end(JSON.stringify({ status: 'already-running' }));
    return;
  }
  res.statusCode = 202;
  res.end(JSON.stringify({ status: 'started' }));
}

async function main(): Promise<void> {
  await runMigrations();

  // Seed the default coupon-type taxonomy (idempotent + repairs a partial seed).
  await getServices().couponTypeService.seedCouponTypes();

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/graphql' || url.startsWith('/graphql?')) {
      void yoga(req, res);
      return;
    }
    if (url.startsWith('/internal/ingest')) {
      handleInternalIngest(req, res);
      return;
    }
    serveStatic(req, res, () => {
      res.statusCode = 404;
      res.end('Not found');
    });
  });

  server.listen(settings.PORT, () => {
    logInfo(`listening on http://localhost:${String(settings.PORT)} (GraphQL at /graphql)`, {
      tag: 'SERVER',
    });
  });

  if (settings.INGEST_INLINE) scheduleIngest();
}

void main().catch((error: unknown) => {
  logException(error, { tag: 'SERVER' });
  process.exit(1);
});
