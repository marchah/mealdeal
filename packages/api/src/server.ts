import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createYoga } from 'graphql-yoga';
import sirv from 'sirv';
import { settings } from './common/settings';
import { createContext } from './context';
import { runMigrations } from './db/migrate';
import { ingestOnce, scheduleIngest } from './ingest/run';
import { schema } from './schema';

// The built SPA. In Docker this is overridden to the copied build dir via WEB_DIR.
const WEB_DIR = settings.webDir ?? new URL('../../web/dist', import.meta.url).pathname;

const yoga = createYoga({ schema, context: createContext, graphqlEndpoint: '/graphql' });
const serveStatic = sirv(WEB_DIR, { single: true, dev: false });

async function handleInternalIngest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = settings.ingest.token;
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
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'ingest failed' }));
  }
}

async function main(): Promise<void> {
  await runMigrations();

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

  server.listen(settings.port, () => {
    console.log(`[server] http://localhost:${String(settings.port)} (GraphQL at /graphql)`);
  });

  if (settings.ingest.inline) scheduleIngest();
}

void main().catch((error: unknown) => {
  console.error('[server] fatal', error);
  process.exit(1);
});
