import { NotFoundError } from '../../common/errors';
import type { MerchantService } from '../merchant/types';
import type { AddNewsletterInput, NewsletterRepository, NewsletterService } from './types';

// Business logic. The merchant existence check makes the expected FK failure a typed domain error.
export function newsletterServiceFactory({
  newsletterRepository,
  merchantService,
}: {
  newsletterRepository: NewsletterRepository;
  merchantService: MerchantService;
}): NewsletterService {
  return {
    async getNewsletter(id: string) {
      const newsletter = await newsletterRepository.findById(id);
      if (!newsletter) throw new NotFoundError(`No newsletter with id ${id}`);
      return newsletter;
    },
    async addNewsletter(input: AddNewsletterInput) {
      const merchants = await merchantService.findByIds([input.merchantId]);
      if (merchants.length === 0)
        throw new NotFoundError(`No merchant with id ${input.merchantId}`);
      return newsletterRepository.create(input);
    },
    async removeNewsletter(id: string) {
      const newsletter = await newsletterRepository.findById(id);
      if (!newsletter) throw new NotFoundError(`No newsletter with id ${id}`);
      await newsletterRepository.remove(id);
      return newsletter;
    },
  };
}
