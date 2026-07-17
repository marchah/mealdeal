import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createYoga } from 'graphql-yoga';
import sirv from 'sirv';
import { ServerError } from './common/errors';
import { logException, logInfo } from './common/logger';
import { settings } from './common/settings';
import { createContext } from './context';
import { runMigrations } from './db/migrate';
import { seedCouponTypes } from './modules/couponType/repository';
import { getServices } from './services';
import { ingestOnce, scheduleIngest } from './ingest/run';
import { schema } from './schema';

// The built SPA. In Docker this is overridden to the copied build dir via WEB_DIR.
const WEB_DIR = settings.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname;

const yoga = createYoga({ schema, context: createContext, graphqlEndpoint: '/graphql' });
const serveStatic = sirv(WEB_DIR, { single: true, dev: false });

async function handleInternalIngest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = settings.INGEST_TOKEN;
  if (req.method !== 'POST' || !token || req.headers['x-ingest-token'] !== token) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  try {
    const result = await ingestOnce();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error instanceof ServerError ? error.status : 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'ingest failed' }));
  }
}

async function main(): Promise<void> {
  await runMigrations();

  // Seed default coupon types if the table is empty.
  await seedCouponTypes(getServices().couponTypeService);

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/graphql' || url.startsWith('/graphql?')) {
      void yoga(req, res);
      return;
    }
    if (url.startsWith('/internal/ingest')) {
      void handleInternalIngest(req, res);
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
