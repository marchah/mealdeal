import { and, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { merchants } from '../../db/schema';
import type { Store, StoreRepository } from './types';

const EARTH_RADIUS_MILES = 3_958.7613;
const DEGREES_TO_RADIANS = Math.PI / 180;

// The SQLite/libsql-specific location filter and Haversine calculation belong in this repository.
export function storeRepositoryFactory({ db }: { db: Db }): StoreRepository {
  return {
    async listWithLocation(input) {
      const latitudeDelta = sql<number>`
        (${merchants.lat} - ${input.lat}) * ${DEGREES_TO_RADIANS}
      `;
      const longitudeDelta = sql<number>`
        (${merchants.lng} - ${input.lng}) * ${DEGREES_TO_RADIANS}
      `;
      const sinLatitude = sql<number>`sin(${latitudeDelta} / 2)`;
      const sinLongitude = sql<number>`sin(${longitudeDelta} / 2)`;
      const haversine = sql<number>`
        ${sinLatitude} * ${sinLatitude} +
        cos(${input.lat} * ${DEGREES_TO_RADIANS}) * cos(${merchants.lat} * ${DEGREES_TO_RADIANS}) *
        ${sinLongitude} * ${sinLongitude}
      `;
      // Clamp the value so floating-point rounding cannot put asin outside its domain.
      const distanceMiles = sql<number>`
        2 * ${EARTH_RADIUS_MILES} * asin(sqrt(min(1.0, max(0.0, ${haversine}))))
      `;
      const rows = await db
        .select({
          id: merchants.id,
          name: merchants.name,
          address: merchants.address,
          lat: merchants.lat,
          lng: merchants.lng,
          distanceMiles,
        })
        .from(merchants)
        .where(and(isNotNull(merchants.lat), isNotNull(merchants.lng)));
      // Drizzle does not narrow nullable columns from SQLite's IS NOT NULL predicates in its
      // result type. Retain this defensive guard at the repository boundary.
      return rows.filter((store): store is Store => store.lat !== null && store.lng !== null);
    },
  };
}
