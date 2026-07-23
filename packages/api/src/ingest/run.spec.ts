import { describe, expect, it, vi } from 'vitest';
import { logWarning } from '../common/logger';
import type { NewDeal } from '../entities/deal/types';
import type { Services } from '../services';
import type { DealExtractor } from './extractor';
import type { FetchedEmail, ImapClient } from './imap';
import { ingestOnce } from './run';

vi.mock('../common/logger', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  logException: vi.fn(),
}));

function email(uid: number, from: string): FetchedEmail {
  return {
    uid,
    from,
    subject: 'Weekly deals',
    date: new Date('2026-01-01T00:00:00Z'),
    text: 'body',
  };
}

// Records every NewDeal handed to addDeal so tests can assert what was stored.
function makeServices(recordAdded?: NewDeal[]): Services {
  return {
    ingestRunService: {
      startIngestRun: () => Promise.resolve('run-1'),
      finishIngestRun: () => Promise.resolve(),
    },
    merchantService: {
      getOrCreateMerchant: () => Promise.resolve({ id: 'm1', name: 'Shop', createdAt: new Date() }),
    },
    dealService: {
      addDeal: (deal: NewDeal) => {
        recordAdded?.push(deal);
        return Promise.resolve(true);
      },
    },
  } as unknown as Services;
}

describe('ingestOnce', () => {
  it('acknowledges only messages whose deals were stored; failed ones stay unseen for retry', async () => {
    const markSeen = vi.fn((_uids: readonly number[]): Promise<void> => Promise.resolve());
    const imap: ImapClient = {
      fetchUnseen: () => Promise.resolve([email(1, 'good@shop.com'), email(2, 'bad@shop.com')]),
      markSeen,
    };
    // Message 2's extraction fails (e.g. LLM down) — it must NOT be acknowledged.
    const extractor: DealExtractor = {
      extract: (e) =>
        e.from === 'bad@shop.com'
          ? Promise.reject(new Error('LLM unavailable'))
          : Promise.resolve([{ merchant: 'Shop', title: 'Cheese 2-for-1' }]),
    };

    const result = await ingestOnce({ imap, extractor, services: makeServices() });

    expect(result).toEqual({ messagesSeen: 2, dealsAdded: 1, messagesFailed: 1 });
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(markSeen).toHaveBeenCalledWith([1]);
  });

  it('dedups on the normalized expiry, so equivalent date formats hash identically', async () => {
    const added: NewDeal[] = [];
    const imap: ImapClient = {
      fetchUnseen: () => Promise.resolve([email(1, 'a@shop.com'), email(2, 'b@shop.com')]),
      markSeen: () => Promise.resolve(),
    };
    // Same offer, two equivalent expiry encodings — must produce one stable dedup hash.
    const extractor: DealExtractor = {
      extract: (e) =>
        Promise.resolve([
          {
            merchant: 'Shop',
            title: 'Cheese',
            expiresAt: e.from === 'a@shop.com' ? '2026-08-01' : '2026-08-01T00:00:00Z',
          },
        ]),
    };

    await ingestOnce({ imap, extractor, services: makeServices(added) });

    expect(added).toHaveLength(2);
    expect(added[0]?.expiresAt).toEqual(added[1]?.expiresAt);
    expect(added[0]?.dedupHash).toBe(added[1]?.dedupHash);
  });

  it('treats a provided-but-unparseable expiry as no expiry and warns', async () => {
    const added: NewDeal[] = [];
    const imap: ImapClient = {
      fetchUnseen: () => Promise.resolve([email(1, 'a@shop.com')]),
      markSeen: () => Promise.resolve(),
    };
    const extractor: DealExtractor = {
      extract: () =>
        Promise.resolve([{ merchant: 'Shop', title: 'Cheese', expiresAt: 'next Friday' }]),
    };

    await ingestOnce({ imap, extractor, services: makeServices(added) });

    expect(added[0]?.expiresAt).toBeNull();
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('unparseable expiresAt'),
      expect.objectContaining({ tag: 'INGEST' }),
    );
  });
});
