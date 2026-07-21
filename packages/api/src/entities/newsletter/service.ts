import { NotFoundError } from '../../common/errors';
import type { MerchantService } from '../merchant/types';
import type { AddNewsletterInput, NewsletterRepository, NewsletterService } from './types';

// Business logic. The merchant existence check makes the expected FK failure a typed domain error.
export function newsletterServiceFactory({
  newsletterRepository,
  merchantService: { findMerchantsByIds },
}: {
  newsletterRepository: NewsletterRepository;
  merchantService: MerchantService;
}): NewsletterService {
  async function getNewsletter(id: string) {
    const newsletter = await newsletterRepository.findNewsletterById(id);
    if (!newsletter) throw new NotFoundError(`No newsletter with id ${id}`);
    return newsletter;
  }

  async function listRecommendedByMerchantIds(merchantIds: readonly string[]) {
    const newsletters =
      await newsletterRepository.listRecommendedNewslettersByMerchantIds(merchantIds);
    return newsletters.sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  }

  async function addNewsletter(input: AddNewsletterInput) {
    const merchants = await findMerchantsByIds([input.merchantId]);
    if (merchants.length === 0) throw new NotFoundError(`No merchant with id ${input.merchantId}`);
    return newsletterRepository.createNewsletter(input);
  }

  async function removeNewsletter(id: string) {
    const newsletter = await newsletterRepository.findNewsletterById(id);
    if (!newsletter) throw new NotFoundError(`No newsletter with id ${id}`);
    await newsletterRepository.removeNewsletter(id);
    return newsletter;
  }

  return { getNewsletter, listRecommendedByMerchantIds, addNewsletter, removeNewsletter };
}
