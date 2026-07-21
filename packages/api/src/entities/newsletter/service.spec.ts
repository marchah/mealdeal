import { describe, expect, it, vi } from 'vitest';
import type { MerchantService } from '../merchant/types';
import { newsletterServiceFactory } from './service';
import type { Newsletter, NewsletterRepository } from './types';

const makeNewsletter = (over: Partial<Newsletter> = {}): Newsletter => ({
  id: 'n1',
  merchantId: 'm1',
  name: 'Weekly Deals',
  signupUrl: 'https://example.test/newsletter',
  recommended: false,
  ...over,
});

function makeService({ newsletters = [makeNewsletter()], merchantIds = ['m1'] } = {}) {
  const createNewsletter = vi.fn((input) => Promise.resolve(makeNewsletter({ ...input })));
  const removeNewsletter = vi.fn(() => Promise.resolve(true));
  const newsletterRepository: NewsletterRepository = {
    findNewsletterById: (id) =>
      Promise.resolve(newsletters.find((newsletter) => newsletter.id === id) ?? null),
    listRecommendedNewslettersByMerchantIds: (merchantIds) =>
      Promise.resolve(
        newsletters.filter(
          (newsletter) => newsletter.recommended && merchantIds.includes(newsletter.merchantId),
        ),
      ),
    createNewsletter,
    removeNewsletter,
  };
  // @ts-expect-error partial mock: only findMerchantsByIds is used
  const merchantService: MerchantService = {
    findMerchantsByIds: (ids: readonly string[]) =>
      Promise.resolve(
        ids
          .filter((id) => merchantIds.includes(id))
          .map((id) => ({
            id,
            name: 'Test Mart',
            address: null,
            lat: null,
            lng: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          })),
      ),
  };

  return {
    service: newsletterServiceFactory({ newsletterRepository, merchantService }),
    createNewsletter,
    removeNewsletter,
  };
}

describe('newsletterService', () => {
  it('returns a newsletter by id', async () => {
    const { service } = makeService();
    await expect(service.getNewsletter('n1')).resolves.toEqual(makeNewsletter());
  });

  it('throws a typed not-found error for a missing newsletter', async () => {
    const { service } = makeService({ newsletters: [] });
    await expect(service.getNewsletter('missing')).rejects.toThrow('No newsletter with id missing');
    await expect(service.removeNewsletter('missing')).rejects.toThrow(
      'No newsletter with id missing',
    );
  });

  it('creates a newsletter for an existing merchant', async () => {
    const { service, createNewsletter } = makeService();
    await expect(
      service.addNewsletter({
        merchantId: 'm1',
        name: 'VIP Savings',
        signupUrl: 'https://example.test/vip',
        recommended: true,
      }),
    ).resolves.toMatchObject({ name: 'VIP Savings', recommended: true });
    expect(createNewsletter).toHaveBeenCalledOnce();
  });

  it('throws a typed not-found error instead of attempting an FK insert for a missing merchant', async () => {
    const { service, createNewsletter } = makeService({ merchantIds: [] });
    await expect(
      service.addNewsletter({
        merchantId: 'missing',
        name: 'VIP Savings',
        signupUrl: 'https://example.test/vip',
        recommended: false,
      }),
    ).rejects.toThrow('No merchant with id missing');
    expect(createNewsletter).not.toHaveBeenCalled();
  });

  it('removes an existing newsletter and returns the removed newsletter', async () => {
    const { service, removeNewsletter } = makeService();
    await expect(service.removeNewsletter('n1')).resolves.toEqual(makeNewsletter());
    expect(removeNewsletter).toHaveBeenCalledWith('n1');
  });

  it('lists recommended newsletters for the requested merchants in a stable order', async () => {
    const { service } = makeService({
      newsletters: [
        makeNewsletter({ id: 'z', merchantId: 'm1', name: 'Zebra', recommended: true }),
        makeNewsletter({ id: 'b', merchantId: 'm1', name: 'Alpha', recommended: true }),
        makeNewsletter({ id: 'a', merchantId: 'm1', name: 'Alpha', recommended: true }),
        makeNewsletter({ id: 'other', merchantId: 'm2', name: 'Nearby?', recommended: true }),
        makeNewsletter({ id: 'not-recommended', merchantId: 'm1', recommended: false }),
      ],
    });

    const newsletters = await service.listRecommendedByMerchantIds(['m1']);

    expect(newsletters.map((newsletter) => newsletter.id)).toEqual(['a', 'b', 'z']);
  });
});
