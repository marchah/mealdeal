import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { ReceiptRef, ReceiptStatusRef } from './type';

builder.queryFields((t) => ({
  receipt: t.field({
    type: ReceiptRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.receiptService.getReceiptById(args.id),
  }),
  receipts: t.field({
    // Newest first; without statuses, every receipt.
    type: [ReceiptRef],
    args: { statuses: t.arg({ type: [ReceiptStatusRef], required: false }) },
    resolve: (_root, args, ctx) =>
      ctx.services.receiptService.listReceipts({ statuses: args.statuses ?? null }),
  }),
}));
