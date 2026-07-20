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
  const create = vi.fn((input) => Promise.resolve(makeNewsletter({ ...input })));
  const remove = vi.fn(() => Promise.resolve(true));
  const newsletterRepository: NewsletterRepository = {
    findById: (id) =>
      Promise.resolve(newsletters.find((newsletter) => newsletter.id === id) ?? null),
    create,
    remove,
  };
  const merchantService = {
    findByIds: (ids: readonly string[]) =>
      Promise.resolve(
        ids.filter((id) => merchantIds.includes(id)).map((id) => ({ id, name: 'Test Mart' })),
      ),
  } as unknown as MerchantService;

  return {
    service: newsletterServiceFactory({ newsletterRepository, merchantService }),
    create,
    remove,
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
    const { service, create } = makeService();
    await expect(
      service.addNewsletter({
        merchantId: 'm1',
        name: 'VIP Savings',
        signupUrl: 'https://example.test/vip',
        recommended: true,
      }),
    ).resolves.toMatchObject({ name: 'VIP Savings', recommended: true });
    expect(create).toHaveBeenCalledOnce();
  });

  it('throws a typed not-found error instead of attempting an FK insert for a missing merchant', async () => {
    const { service, create } = makeService({ merchantIds: [] });
    await expect(
      service.addNewsletter({
        merchantId: 'missing',
        name: 'VIP Savings',
        signupUrl: 'https://example.test/vip',
        recommended: false,
      }),
    ).rejects.toThrow('No merchant with id missing');
    expect(create).not.toHaveBeenCalled();
  });

  it('removes an existing newsletter and returns the removed newsletter', async () => {
    const { service, remove } = makeService();
    await expect(service.removeNewsletter('n1')).resolves.toEqual(makeNewsletter());
    expect(remove).toHaveBeenCalledWith('n1');
  });
});
