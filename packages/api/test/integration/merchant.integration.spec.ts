import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import { merchants } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../../src/db/migrate';

describe('Merchant Location Integration', () => {
  let db: ReturnType<typeof createDb>;

  it('persists and retrieves merchant location fields', async () => {
    db = createDb();
    await runMigrations();

    const merchantId = 'test-location-merchant';
    await db.insert(merchants).values({
      id: merchantId,
      name: 'Test Store',
      address: '123 Main St',
      lat: 40.7128,
      lng: -74.006,
      createdAt: new Date(),
    });

    const result = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: merchantId,
      name: 'Test Store',
      address: '123 Main St',
      lat: 40.7128,
      lng: -74.006,
    });
  });

  it('handles nullable location fields', async () => {
    db = createDb();
    await runMigrations();

    const merchantId = 'test-no-location';
    await db.insert(merchants).values({
      id: merchantId,
      name: 'No Location Store',
      createdAt: new Date(),
    });

    const result = await db
      .select()
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);

    expect(result).toHaveLength(1);
    expect(result[0].address).toBeNull();
    expect(result[0].lat).toBeNull();
    expect(result[0].lng).toBeNull();
  });
});
