import { builder } from './builder';

// Side-effect imports: each module registers its GraphQL types/fields on the shared
// builder. Add a new module's schema here so it appears in the schema.
import './entities/couponType/schema.pothos';
import './entities/deal/schema.pothos';
import './entities/merchant/schema.pothos';
import './entities/trackingPref/schema.pothos';

export const schema = builder.toSchema();
