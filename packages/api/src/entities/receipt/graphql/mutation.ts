import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { ReceiptRef } from './type';

builder.mutationFields((t) => ({
  deleteReceipt: t.field({
    // The rows and the photos go; any price entries it produced stay (docs/PLAN.md data model).
    type: ReceiptRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.receiptService.deleteReceipt(args.id),
  }),
}));
