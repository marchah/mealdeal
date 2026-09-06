import { describe, expect, it } from 'vitest';
import type { Maybe } from '../../common/types';
import type { IngestRunService } from '../ingestRun/types';
import { appConfigServiceFactory } from './service';

function makeService(over: { couponIngestEnabled?: boolean; lastIngestAt?: Maybe<Date> } = {}) {
  // @ts-expect-error partial mock: only lastIngestCompletedAt is used
  const ingestRunService: IngestRunService = {
    lastIngestCompletedAt: () => Promise.resolve(over.lastIngestAt ?? null),
  };
  return appConfigServiceFactory({
    config: { COUPON_INGEST_ENABLED: over.couponIngestEnabled ?? false },
    ingestRunService,
  });
}

describe('appConfigService', () => {
  it('reports ingestion as paused by default, with the last completed run', async () => {
    const lastIngestAt = new Date('2026-08-12T09:30:00Z');
    await expect(makeService({ lastIngestAt }).getAppConfig()).resolves.toEqual({
      couponIngestEnabled: false,
      lastIngestAt,
    });
  });

  it('reports ingestion as enabled when the flag is on', async () => {
    const config = await makeService({ couponIngestEnabled: true }).getAppConfig();
    expect(config.couponIngestEnabled).toBe(true);
  });

  it('reports a null lastIngestAt when no run has ever completed', async () => {
    // A fresh install: the banner must not claim an import date it does not have.
    const config = await makeService({ lastIngestAt: null }).getAppConfig();
    expect(config.lastIngestAt).toBeNull();
    expect(config.couponIngestEnabled).toBe(false);
  });

  it('still reports the last run while ingestion is paused', async () => {
    // The pause is a config decision, not a stalled pipeline — the previous run stays visible.
    const lastIngestAt = new Date('2026-07-01T00:00:00Z');
    await expect(
      makeService({ couponIngestEnabled: false, lastIngestAt }).getAppConfig(),
    ).resolves.toEqual({ couponIngestEnabled: false, lastIngestAt });
  });
});
