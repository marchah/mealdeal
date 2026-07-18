import { builder } from './builder';

// Side-effect imports: each module registers its GraphQL types/fields on the shared
// builder. Add a new module's schema here so it appears in the schema.
import './modules/couponType/schema.pothos';
import './modules/deal/schema.pothos';
import './modules/merchant/schema.pothos';
import './modules/trackingPref/schema.pothos';

export const schema = builder.toSchema();
