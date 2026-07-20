import { builder } from '../../../builder';
import type { Newsletter } from '../types';

export const NewsletterRef = builder.objectRef<Newsletter>('Newsletter');
NewsletterRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    merchantId: t.exposeID('merchantId'),
    name: t.exposeString('name'),
    signupUrl: t.exposeString('signupUrl'),
    recommended: t.exposeBoolean('recommended'),
  }),
});
