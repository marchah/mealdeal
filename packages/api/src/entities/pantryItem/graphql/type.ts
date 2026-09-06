import { builder } from '../../../builder';
import { Unit } from '../../../common/units';
import { CouponTypeRef } from '../../couponType/graphql/type';
import type { PantryItem, PantryItemDraft } from '../types';

// Unit is shared with priceEntry, and a GraphQL enum may only be registered once — pantryItem
// owns the registration as its first consumer, and the other slice imports this ref.
export const UnitRef = builder.enumType(Unit, { name: 'Unit' });

export const PantryItemRef = builder.objectRef<PantryItem>('PantryItem');
PantryItemRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    brand: t.exposeString('brand', { nullable: true }),
    couponTypeId: t.exposeID('couponTypeId', { nullable: true }),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    sizeAmount: t.exposeFloat('sizeAmount', { nullable: true }),
    sizeUnit: t.expose('sizeUnit', { type: UnitRef, nullable: true }),
    unitPriceUnit: t.expose('unitPriceUnit', { type: UnitRef }),
    targetPrice: t.exposeFloat('targetPrice', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    archived: t.exposeBoolean('archived'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    // The pantry category IS a coupon type (docs/PLAN.md decision 1), batched per request so a
    // list of items costs one taxonomy query rather than one per item.
    category: t.field({
      type: CouponTypeRef,
      nullable: true,
      resolve: (item, _args, ctx) =>
        item.couponTypeId === null ? null : ctx.loaders.couponTypeById.load(item.couponTypeId),
    }),
  }),
});

/**
 * What a product page yielded. Nothing here is stored — the form is prefilled and the user
 * confirms, so `found: false` opens a blank form rather than reporting an error.
 */
export const PantryItemDraftRef = builder.objectRef<PantryItemDraft>('PantryItemDraft');
PantryItemDraftRef.implement({
  fields: (t) => ({
    url: t.exposeString('url'),
    found: t.exposeBoolean('found'),
    name: t.exposeString('name', { nullable: true }),
    brand: t.exposeString('brand', { nullable: true }),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    price: t.exposeFloat('price', { nullable: true }),
    currency: t.exposeString('currency', { nullable: true }),
    sizeAmount: t.exposeFloat('sizeAmount', { nullable: true }),
    sizeUnit: t.expose('sizeUnit', { type: UnitRef, nullable: true }),
  }),
});

export const PantryItemInputRef = builder.inputType('PantryItemInput', {
  fields: (t) => ({
    name: t.string({ required: true, validate: { minLength: 1, maxLength: 200 } }),
    brand: t.string({ required: false, validate: { maxLength: 200 } }),
    couponTypeId: t.id({ required: false }),
    imageUrl: t.string({
      required: false,
      validate: {
        maxLength: 2_000,
        url: true,
        refine: [
          (value) => /^https?:\/\//i.test(value),
          { message: 'imageUrl must be an http(s) URL' },
        ],
      },
    }),
    sizeAmount: t.float({ required: false, validate: { positive: true } }),
    sizeUnit: t.field({ type: UnitRef, required: false }),
    unitPriceUnit: t.field({ type: UnitRef, required: true }),
    targetPrice: t.float({ required: false, validate: { positive: true } }),
    notes: t.string({ required: false, validate: { maxLength: 2_000 } }),
  }),
});
