import { builder } from '../../../builder';
import { NotFoundError, ValidationError } from '../../../common/errors';
import { NewsletterRef } from './type';

builder.mutationFields((t) => ({
  addNewsletter: t.field({
    type: NewsletterRef,
    errors: { types: [NotFoundError, ValidationError] },
    args: {
      merchantId: t.arg.id({ required: true }),
      name: t.arg.string({ required: true, validate: { minLength: 1, maxLength: 200 } }),
      // `url: true` accepts any parseable URL — including `javascript:`/`data:`. Since the web
      // renders signupUrl as an <a href>, restrict it to http(s) so a stored link can't be a script.
      signupUrl: t.arg.string({
        required: true,
        validate: {
          maxLength: 2_000,
          url: true,
          refine: [
            (value) => /^https?:\/\//i.test(value),
            { message: 'signupUrl must be an http(s) URL' },
          ],
        },
      }),
      recommended: t.arg.boolean({ defaultValue: false }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.newsletterService.addNewsletter({
        merchantId: args.merchantId,
        name: args.name,
        signupUrl: args.signupUrl,
        recommended: args.recommended ?? false,
      }),
  }),
  removeNewsletter: t.field({
    type: NewsletterRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.newsletterService.removeNewsletter(args.id),
  }),
}));
