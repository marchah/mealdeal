import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { logWarning } from '../common/logger';
import type { CouponType } from '../entities/couponType/types';
import type { NewDeal } from '../entities/deal/types';
import type { Services } from '../services';
import type { EmailSource, FetchedEmail } from './email';
import type { DealExtractor } from './extractor';
import { canonicalEmailBody, ingestOnce, MAX_CANONICAL_BODY_LENGTH } from './run';

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
    html: null,
  };
}

const couponTypes: CouponType[] = [
  { id: 'coupon-food', key: 'food', label: 'Food', createdAt: new Date('2026-01-01T00:00:00Z') },
  { id: 'coupon-other', key: 'other', label: 'Other', createdAt: new Date('2026-01-01T00:00:00Z') },
];

// Records every NewDeal handed to addDeal so tests can assert what was stored.
function makeServices(recordAdded?: NewDeal[], types: CouponType[] = couponTypes): Services {
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
    couponTypeService: {
      getCouponTypes: () => Promise.resolve(types),
      getCouponTypeByKey: (key: string) =>
        Promise.resolve(types.find((type) => type.key === key) ?? null),
    },
  } as unknown as Services;
}

describe('ingestOnce', () => {
  it('uses converted Markdown as the extractor input and raw excerpt source', async () => {
    const added: NewDeal[] = [];
    const extract = vi.fn(() => Promise.resolve([{ merchant: 'Shop', title: 'Cheese' }]));
    const emailSource: EmailSource = {
      fetchUnseen: () =>
        Promise.resolve([
          { ...email(1, 'shop@example.com'), text: 'plain text', html: '<h1>Offer</h1>' },
        ]),
      markSeen: () => Promise.resolve(),
    };
    const htmlToMarkdown = { convert: vi.fn(() => '# Offer\n\nCheese for $2.99') };

    await ingestOnce({
      emailSource,
      extractor: { extract },
      htmlToMarkdown,
      services: makeServices(added),
    });

    expect(extract).toHaveBeenCalledWith({
      subject: 'Weekly deals',
      from: 'shop@example.com',
      body: '# Offer\n\nCheese for $2.99',
      couponTypes,
    });
    expect(added[0]?.rawExcerpt).toBe('# Offer\n\nCheese for $2.99');
  });

  it('stores a recognized couponTypeKey as the matching coupon type ID', async () => {
    const added: NewDeal[] = [];
    const emailSource: EmailSource = {
      fetchUnseen: () => Promise.resolve([email(1, 'shop@example.com')]),
      markSeen: () => Promise.resolve(),
    };

    await ingestOnce({
      emailSource,
      extractor: {
        extract: () =>
          Promise.resolve([{ merchant: 'Shop', title: 'Cheese', couponTypeKey: 'food' }]),
      },
      services: makeServices(added),
    });

    expect(added[0]?.couponTypeId).toBe('coupon-food');
  });

  it.each([
    { name: 'missing', couponTypeKey: undefined },
    { name: 'blank', couponTypeKey: '   ' },
  ])('falls back to other when the couponTypeKey is $name', async ({ couponTypeKey }) => {
    const added: NewDeal[] = [];
    const emailSource: EmailSource = {
      fetchUnseen: () => Promise.resolve([email(1, 'shop@example.com')]),
      markSeen: () => Promise.resolve(),
    };

    await ingestOnce({
      emailSource,
      extractor: {
        extract: () => Promise.resolve([{ merchant: 'Shop', title: 'Cheese', couponTypeKey }]),
      },
      services: makeServices(added),
    });

    expect(added[0]?.couponTypeId).toBe('coupon-other');
  });

  it('warns and falls back to other for an unknown couponTypeKey', async () => {
    const added: NewDeal[] = [];
    const emailSource: EmailSource = {
      fetchUnseen: () => Promise.resolve([email(7, 'shop@example.com')]),
      markSeen: () => Promise.resolve(),
    };

    await ingestOnce({
      emailSource,
      extractor: {
        extract: () =>
          Promise.resolve([{ merchant: 'Shop', title: 'Cheese', couponTypeKey: 'seasonal' }]),
      },
      services: makeServices(added),
    });

    expect(added[0]?.couponTypeId).toBe('coupon-other');
    expect(logWarning).toHaveBeenCalledWith(
      'unknown couponTypeKey "seasonal"; falling back to "other"',
      expect.objectContaining({ tag: 'INGEST', extra: { uid: 7, couponTypeKey: 'seasonal' } }),
    );
  });

  it('fails the message instead of inserting a deal when the required other type is unavailable', async () => {
    const added: NewDeal[] = [];
    const markSeen = vi.fn((_uids: readonly number[]): Promise<void> => Promise.resolve());
    const emailSource: EmailSource = {
      fetchUnseen: () => Promise.resolve([email(1, 'shop@example.com')]),
      markSeen,
    };

    const result = await ingestOnce({
      emailSource,
      extractor: {
        extract: () =>
          Promise.resolve([{ merchant: 'Shop', title: 'Cheese', couponTypeKey: 'food' }]),
      },
      services: makeServices(added, [couponTypes[0]!]),
    });

    expect(result).toEqual({ messagesSeen: 1, dealsAdded: 0, messagesFailed: 1 });
    expect(added).toEqual([]);
    expect(markSeen).toHaveBeenCalledWith([]);
  });

  it('falls back to plain text and bounds the canonical extraction body', () => {
    const plainText = 'a'.repeat(MAX_CANONICAL_BODY_LENGTH + 1);
    const convert = vi.fn();

    const body = canonicalEmailBody({ html: null, text: plainText }, { convert });

    expect(body).toHaveLength(MAX_CANONICAL_BODY_LENGTH);
    expect(convert).not.toHaveBeenCalled();
  });

  it('acknowledges only messages whose deals were stored; failed ones stay unseen for retry', async () => {
    const markSeen = vi.fn((_uids: readonly number[]): Promise<void> => Promise.resolve());
    const emailSource: EmailSource = {
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

    const result = await ingestOnce({ emailSource, extractor, services: makeServices() });

    expect(result).toEqual({ messagesSeen: 2, dealsAdded: 1, messagesFailed: 1 });
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(markSeen).toHaveBeenCalledWith([1]);
  });

  it('has no archive filesystem side effect when archiving is disabled', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'mealdeal-no-archive-'));
    const archiveDirectory = join(parent, 'archive');
    const emailSource: EmailSource = {
      fetchUnseen: () => Promise.resolve([email(1, 'shop@example.com')]),
      markSeen: () => Promise.resolve(),
    };
    try {
      await ingestOnce({
        emailSource,
        archiveDirectory: null,
        extractor: { extract: () => Promise.resolve([]) },
        services: makeServices(),
      });

      await expect(access(archiveDirectory)).rejects.toThrow();
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });

  it('archives canonical Markdown before extracting when enabled', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mealdeal-archive-run-'));
    const emailSource: EmailSource = {
      fetchUnseen: () =>
        Promise.resolve([
          { ...email(1, 'shop@example.com'), html: '<h1>Deals</h1>', text: 'fallback' },
        ]),
      markSeen: () => Promise.resolve(),
    };
    try {
      await ingestOnce({
        emailSource,
        archiveDirectory: directory,
        extractor: { extract: () => Promise.resolve([]) },
        htmlToMarkdown: { convert: () => '# Deals' },
        services: makeServices(),
      });

      const files = await readdir(directory);
      expect(files).toHaveLength(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('dedups on the normalized expiry, so equivalent date formats hash identically', async () => {
    const added: NewDeal[] = [];
    const emailSource: EmailSource = {
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

    await ingestOnce({ emailSource, extractor, services: makeServices(added) });

    expect(added).toHaveLength(2);
    expect(added[0]?.expiresAt).toEqual(added[1]?.expiresAt);
    expect(added[0]?.dedupHash).toBe(added[1]?.dedupHash);
  });

  it('treats a provided-but-unparseable expiry as no expiry and warns', async () => {
    const added: NewDeal[] = [];
    const emailSource: EmailSource = {
      fetchUnseen: () => Promise.resolve([email(1, 'a@shop.com')]),
      markSeen: () => Promise.resolve(),
    };
    const extractor: DealExtractor = {
      extract: () =>
        Promise.resolve([{ merchant: 'Shop', title: 'Cheese', expiresAt: 'next Friday' }]),
    };

    await ingestOnce({ emailSource, extractor, services: makeServices(added) });

    expect(added[0]?.expiresAt).toBeNull();
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('unparseable expiresAt'),
      expect.objectContaining({ tag: 'INGEST' }),
    );
  });
});
