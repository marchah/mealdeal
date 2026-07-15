import express, { type Request, type Response, type Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.ts';
import type { Db } from './db/db.ts';
import type { PrefKind, PrefScope } from './types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function createServer(cfg: Config, db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(HERE, '..', 'public')));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Active deals (not expired, not muted). The UI renders these.
  app.get('/api/deals', (_req: Request, res: Response) => {
    res.json(db.listActiveDeals());
  });

  // Ingest + deal count summary for observability.
  app.get('/api/stats', (_req: Request, res: Response) => {
    res.json(db.getStats());
  });

  // Tracking prefs: mute ("stop tracking") / watchlist ("alert me").
  app.get('/api/prefs', (_req: Request, res: Response) => {
    res.json(db.listPrefs());
  });
  app.post('/api/prefs', (req: Request, res: Response) => {
    const { kind, scope, value } = (req.body ?? {}) as { kind?: string; scope?: string; value?: string };
    if (!isKind(kind) || !isScope(scope) || !value) {
      res.status(400).json({ error: 'require kind (mute|watchlist), scope (item|category), value' });
      return;
    }
    db.addPref(kind, scope, String(value));
    res.status(201).json({ ok: true });
  });
  app.delete('/api/prefs/:id', (req: Request, res: Response) => {
    db.removePref(Number(req.params.id));
    res.json({ ok: true });
  });

  // Optional external push (another ingester). Disabled unless INGEST_TOKEN is set.
  // TODO(local AI): implement — validate an ExtractedDeal[] body and upsert each.
  app.post('/api/ingest', (req: Request, res: Response) => {
    if (!cfg.ingestToken || req.get('authorization') !== `Bearer ${cfg.ingestToken}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.status(501).json({ error: 'not implemented' });
  });

  return app;
}

function isKind(v: unknown): v is PrefKind {
  return v === 'mute' || v === 'watchlist';
}
function isScope(v: unknown): v is PrefScope {
  return v === 'item' || v === 'category';
}
