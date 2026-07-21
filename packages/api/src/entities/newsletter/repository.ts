import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Maybe } from '../../common/types';
import type { Db } from '../../db/client';
import { newsletters } from '../../db/schema';
import type { AddNewsletterInput, Newsletter, NewsletterRepository } from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the NewsletterRepository port.
export function newsletterRepositoryFactory({ db }: { db: Db }): NewsletterRepository {
  return {
    async findById(id: string): Promise<Maybe<Newsletter>> {
      const rows = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async create(input: AddNewsletterInput): Promise<Newsletter> {
      const newsletter: Newsletter = { id: randomUUID(), ...input };
      await db.insert(newsletters).values(newsletter);
      return newsletter;
    },
    async remove(id: string): Promise<boolean> {
      const result = await db.delete(newsletters).where(eq(newsletters.id, id));
      return (result.rowsAffected ?? 0) > 0;
    },
  };
}
