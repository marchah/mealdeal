import { z } from 'zod';
import { builder } from '../../../builder';
import {
  ConflictError,
  NotFoundError,
  ReceiptImportDisabledError,
  ValidationError,
} from '../../../common/errors';
import type { ReceiptPhotoInput } from '../../../entities/receipt/types';
import { ReceiptRef } from '../../../entities/receipt/graphql/type';

/** A long receipt is several photos, but not this many. */
const MAX_PHOTOS = 10;
/** What the OCR service accepts (deploy/ocr/server.py). */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

// Yoga's File is a ponyfill in Node, not always the global class, so it is checked by shape.
const PhotoSchema = z
  .custom<File>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      'arrayBuffer' in value &&
      'size' in value &&
      typeof value.size === 'number' &&
      'type' in value &&
      typeof value.type === 'string',
    { message: 'Each image must be an uploaded file' },
  )
  .refine((file) => file.type.startsWith('image/'), {
    message: 'Only image files can be uploaded as a receipt',
  })
  .refine((file) => file.size > 0, { message: 'A receipt photo must not be empty' })
  .refine((file) => file.size <= MAX_PHOTO_BYTES, {
    message: `A receipt photo must be at most ${String(MAX_PHOTO_BYTES / 1024 / 1024)} MB`,
  });

const PhotosSchema = z
  .array(PhotoSchema)
  .min(1, { message: 'A receipt needs at least one photo' })
  .max(MAX_PHOTOS, { message: `A receipt can have at most ${String(MAX_PHOTOS)} photos` });

async function toPhotoInput(file: File): Promise<ReceiptPhotoInput> {
  return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

builder.mutationFields((t) => ({
  uploadReceipt: t.field({
    // Answers as soon as the photos are stored, as UPLOADED; poll the receipt for the rest.
    type: ReceiptRef,
    errors: { types: [ConflictError, ReceiptImportDisabledError, ValidationError] },
    args: {
      images: t.arg({ type: ['File'], required: true, validate: { schema: PhotosSchema } }),
    },
    resolve: async (_root, args, ctx) =>
      ctx.services.receiptImportService.uploadReceipt({
        photos: await Promise.all(args.images.map(toPhotoInput)),
      }),
  }),
  retryReceipt: t.field({
    type: ReceiptRef,
    errors: { types: [ConflictError, NotFoundError, ReceiptImportDisabledError] },
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => ctx.services.receiptImportService.retryReceipt(args.id),
  }),
}));
