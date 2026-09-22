import { builder } from '../../../builder';
import { ConflictError, NotFoundError, ValidationError } from '../../../common/errors';
import type { PantryItemInput } from '../types';
import { PantryItemDraftRef, PantryItemInputRef, PantryItemRef } from './type';

// The GraphQL input carries `undefined` for an omitted optional field; the domain speaks in
// nulls, so the boundary is where the two meet.
function toPantryItemInput(input: typeof PantryItemInputRef.$inferInput): PantryItemInput {
  return {
    name: input.name,
    brand: input.brand ?? null,
    couponTypeId: input.couponTypeId ?? null,
    imageUrl: input.imageUrl ?? null,
    sizeAmount: input.sizeAmount ?? null,
    sizeUnit: input.sizeUnit ?? null,
    unitPriceUnit: input.unitPriceUnit,
    targetPrice: input.targetPrice ?? null,
    notes: input.notes ?? null,
  };
}

builder.mutationFields((t) => ({
  addPantryItem: t.field({
    type: PantryItemRef,
    errors: { types: [ConflictError, NotFoundError, ValidationError] },
    args: { input: t.arg({ type: PantryItemInputRef, required: true }) },
    resolve: (_root, args, ctx) =>
      ctx.services.pantryItemService.addPantryItem(toPantryItemInput(args.input)),
  }),
  updatePantryItem: t.field({
    type: PantryItemRef,
    errors: { types: [ConflictError, NotFoundError, ValidationError] },
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: PantryItemInputRef, required: true }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.pantryItemService.updatePantryItem(args.id, toPantryItemInput(args.input)),
  }),
  archivePantryItem: t.field({
    type: PantryItemRef,
    errors: { types: [NotFoundError] },
    args: {
      id: t.arg.id({ required: true }),
      // Restoring is the same call with `false`, so an archived item is never a dead end.
      archived: t.arg.boolean({ defaultValue: true }),
    },
    resolve: (_root, args, ctx) =>
      ctx.services.pantryItemService.archivePantryItem(args.id, args.archived ?? true),
  }),
  draftPantryItemFromUrl: t.field({
    type: PantryItemDraftRef,
    // Reads a page; stores nothing. ValidationError covers a URL that must not be fetched at all
    // — a page that simply could not be read comes back as `found: false`.
    errors: { types: [ValidationError] },
    args: {
      url: t.arg.string({
        required: true,
        validate: {
          maxLength: 2_000,
          url: true,
          refine: [
            (value) => /^https?:\/\//i.test(value),
            { message: 'url must be an http(s) URL' },
          ],
        },
      }),
    },
    resolve: (_root, args, ctx) => ctx.services.pantryItemService.draftPantryItemFromUrl(args.url),
  }),
  deletePantryItem: t.field({
    type: PantryItemRef,
    errors: { types: [NotFoundError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.pantryItemService.deletePantryItem(args.id),
  }),
}));
