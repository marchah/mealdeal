import { describe, expect, it, vi } from 'vitest';
import type { Services } from '../services';
import type { DealExtractor } from './extractor';
import type { FetchedEmail, ImapClient } from './imap';
import { ingestOnce } from './run';

function email(uid: number, from: string): FetchedEmail {
  return {
    uid,
    from,
    subject: 'Weekly deals',
    date: new Date('2026-01-01T00:00:00Z'),
    text: 'body',
  };
}

function makeServices(): Services {
  return {
    ingestRunService: {
      start: () => Promise.resolve('run-1'),
      finish: () => Promise.resolve(),
    },
    merchantService: {
      getOrCreate: () => Promise.resolve({ id: 'm1', name: 'Shop', createdAt: new Date() }),
    },
    dealService: {
      add: () => Promise.resolve(true),
    },
  } as unknown as Services;
}

describe('ingestOnce', () => {
  it('acknowledges only messages whose deals were stored; failed ones stay unseen for retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
});
