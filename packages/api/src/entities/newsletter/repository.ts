import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Maybe } from '../../common/types';
import type { Db } from '../../db/client';
import { newsletters } from '../../db/schema';
import type { AddNewsletterInput, Newsletter, NewsletterRepository } from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the NewsletterRepository port.
export function newsletterRepositoryFactory({ db }: { db: Db }): NewsletterRepository {
  async function findNewsletterById(id: string): Promise<Maybe<Newsletter>> {
    const rows = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function listRecommendedNewslettersByMerchantIds(merchantIds: readonly string[]) {
    if (merchantIds.length === 0) return [];
    return db
      .select()
      .from(newsletters)
      .where(
        and(eq(newsletters.recommended, true), inArray(newsletters.merchantId, [...merchantIds])),
      );
  }

  async function createNewsletter(input: AddNewsletterInput): Promise<Newsletter> {
    const newsletter: Newsletter = { id: randomUUID(), ...input };
    await db.insert(newsletters).values(newsletter);
    return newsletter;
  }

  async function removeNewsletter(id: string): Promise<boolean> {
    const result = await db.delete(newsletters).where(eq(newsletters.id, id));
    return (result.rowsAffected ?? 0) > 0;
  }

  return {
    findNewsletterById,
    listRecommendedNewslettersByMerchantIds,
    createNewsletter,
    removeNewsletter,
  };
}
