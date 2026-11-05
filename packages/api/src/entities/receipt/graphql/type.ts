import { builder } from '../../../builder';
import { NotFoundError } from '../../../common/errors';
import { MerchantRef } from '../../merchant/graphql/type';
import { UnitRef } from '../../pantryItem/graphql/type';
import {
  ReceiptFlag,
  ReceiptLineFlag,
  ReceiptStage,
  ReceiptStatus,
  type Receipt,
  type ReceiptLine,
} from '../types';

export const ReceiptStatusRef = builder.enumType(ReceiptStatus, { name: 'ReceiptStatus' });
export const ReceiptStageRef = builder.enumType(ReceiptStage, { name: 'ReceiptStage' });
export const ReceiptFlagRef = builder.enumType(ReceiptFlag, { name: 'ReceiptFlag' });
export const ReceiptLineFlagRef = builder.enumType(ReceiptLineFlag, { name: 'ReceiptLineFlag' });

// A line as the parser read it. Matching and the review decision arrive with slices 5 and 6.
export const ReceiptLineRef = builder.objectRef<ReceiptLine>('ReceiptLine');
ReceiptLineRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    position: t.exposeInt('position'),
    itemNumber: t.exposeString('itemNumber', { nullable: true }),
    printedText: t.exposeString('printedText'),
    description: t.exposeString('description', { nullable: true }),
    quantity: t.exposeFloat('quantity'),
    unitPrice: t.exposeFloat('unitPrice', { nullable: true }),
    weight: t.exposeFloat('weight', { nullable: true }),
    weightUnit: t.expose('weightUnit', { type: UnitRef, nullable: true }),
    lineTotal: t.exposeFloat('lineTotal'),
    discount: t.exposeFloat('discount', { nullable: true }),
    taxFlag: t.exposeString('taxFlag', { nullable: true }),
    flags: t.expose('flags', { type: [ReceiptLineFlagRef] }),
  }),
});

export const ReceiptRef = builder.objectRef<Receipt>('Receipt');
ReceiptRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.expose('status', { type: ReceiptStatusRef }),
    failedStage: t.expose('failedStage', { type: ReceiptStageRef, nullable: true }),
    error: t.exposeString('error', { nullable: true }),
    purchasedAt: t.expose('purchasedAt', { type: 'DateTime', nullable: true }),
    subtotal: t.exposeFloat('subtotal', { nullable: true }),
    tax: t.exposeFloat('tax', { nullable: true }),
    total: t.exposeFloat('total', { nullable: true }),
    flags: t.expose('flags', { type: [ReceiptFlagRef] }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    merchant: t.field({
      type: MerchantRef,
      nullable: true,
      resolve: async (receipt, _args, ctx) => {
        if (receipt.merchantId === null) return null;
        const merchant = await ctx.loaders.merchantById.load(receipt.merchantId);
        if (!merchant) throw new NotFoundError(`Merchant ${receipt.merchantId} not found`);
        return merchant;
      },
    }),
    photoCount: t.int({
      resolve: async (receipt, _args, ctx) =>
        (await ctx.loaders.receiptImagesByReceiptId.load(receipt.id)).length,
    }),
    lines: t.field({
      type: [ReceiptLineRef],
      resolve: (receipt, _args, ctx) => ctx.loaders.receiptLinesByReceiptId.load(receipt.id),
    }),
  }),
});
