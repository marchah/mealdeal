import { builder } from './builder';

// Importing each package runs its slices' side-effect GraphQL registration on the shared
// builder. Add a new package here so its types/fields appear in the schema.
import './entities';
import './features';

export const schema = builder.toSchema();
