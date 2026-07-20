import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { NewsletterRef } from './type';

builder.queryFields((t) => ({
  newsletter: t.field({
    type: NewsletterRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.newsletterService.getNewsletter(args.id),
  }),
}));
