import { createHash } from 'node:crypto';
import { NotFoundError, ValidationError } from '../../common/errors';
import { logException } from '../../common/logger';
import {
  ReceiptStatus,
  type AddReceiptInput,
  type ListReceiptsInput,
  type NewReceiptImage,
  type ReceiptImage,
  type ReceiptLineMatchInput,
  type ReceiptOcrInput,
  type ReceiptParseInput,
  type ReceiptPhotoInput,
  type ReceiptPhotoStore,
  type ReceiptRepository,
  type ReceiptService,
  type ReceiptStage,
  type ReceiptUpdate,
} from './types';

// A digest per photo, then one over the digests in order: fixed-width framing, so no two
// different photo sets can concatenate to the same input.
function hashPhotos(photos: readonly ReceiptPhotoInput[]): string {
  const hash = createHash('sha256');
  for (const photo of photos) hash.update(createHash('sha256').update(photo.bytes).digest());
  return hash.digest('hex');
}

const CLEARED_FAILURE = { failedStage: null, error: null } as const;

// Business logic. The repository and the photo store are injected whole and first.
export function receiptServiceFactory({
  receiptRepository,
  receiptPhotoStore,
}: {
  receiptRepository: ReceiptRepository;
  receiptPhotoStore: ReceiptPhotoStore;
}): ReceiptService {
  // Best effort: the rows are already gone, or were never written, so a photo that will not
  // delete is an orphan file to report — not a reason to fail the caller.
  async function deletePhotos(paths: readonly string[]) {
    for (const path of paths) {
      try {
        await receiptPhotoStore.deleteReceiptPhoto(path);
      } catch (error) {
        logException(error, { tag: 'RECEIPT', extra: { path } });
      }
    }
  }

  async function updateReceiptOrThrow(id: string, update: ReceiptUpdate) {
    const receipt = await receiptRepository.updateReceipt(id, update);
    if (!receipt) throw new NotFoundError(`No receipt with id ${id}`);
    return receipt;
  }

  async function getReceiptById(id: string) {
    const receipt = await receiptRepository.findReceiptById(id);
    if (!receipt) throw new NotFoundError(`No receipt with id ${id}`);
    return receipt;
  }

  function listReceipts(input: ListReceiptsInput) {
    return receiptRepository.listReceipts(input);
  }

  function listReceiptImages(receiptId: string) {
    return receiptRepository.listReceiptImages(receiptId);
  }

  function listReceiptLines(receiptId: string) {
    return receiptRepository.listReceiptLines(receiptId);
  }

  function readReceiptImage(image: ReceiptImage) {
    return receiptPhotoStore.readReceiptPhoto(image.path);
  }

  async function addReceipt(input: AddReceiptInput) {
    if (input.photos.length === 0) throw new ValidationError('A receipt needs at least one photo');
    if (input.photos.some((photo) => photo.bytes.byteLength === 0)) {
      throw new ValidationError('A receipt photo must not be empty');
    }
    if (input.photos.some((photo) => photo.contentType.trim() === '')) {
      throw new ValidationError('A receipt photo needs a content type');
    }

    // Files first, rows second: a crash in between leaves an orphan file, never a row pointing
    // at a photo that does not exist.
    const images: NewReceiptImage[] = [];
    try {
      for (const photo of input.photos) {
        images.push({
          path: await receiptPhotoStore.saveReceiptPhoto(photo.bytes),
          contentType: photo.contentType.trim(),
          bytes: photo.bytes.byteLength,
        });
      }
      return await receiptRepository.insertReceipt({
        status: ReceiptStatus.UPLOADED,
        imageHash: hashPhotos(input.photos),
        images,
      });
    } catch (error) {
      await deletePhotos(images.map((image) => image.path));
      throw error;
    }
  }

  async function updateReceiptStatus(id: string, status: ReceiptStatus) {
    if (status === ReceiptStatus.FAILED) {
      // A FAILED receipt without its stage could never be retried.
      throw new ValidationError('Record a failure with its stage, through recordReceiptFailure');
    }
    return updateReceiptOrThrow(id, { status, ...CLEARED_FAILURE });
  }

  function updateReceiptOcrText(id: string, input: ReceiptOcrInput) {
    return updateReceiptOrThrow(id, {
      ocrText: input.ocrText,
      ocrEngine: input.ocrEngine,
      status: ReceiptStatus.OCR_DONE,
      ...CLEARED_FAILURE,
    });
  }

  async function updateReceiptParse(id: string, input: ReceiptParseInput) {
    const { lines, ...header } = input;
    if (lines.some((line) => line.printedText.trim() === '')) {
      throw new ValidationError('A receipt line must have its printed text');
    }
    if (lines.some((line) => (line.weight === null) !== (line.weightUnit === null))) {
      throw new ValidationError('weight and weightUnit must be given together');
    }
    const receipt = await receiptRepository.replaceReceiptLines(
      id,
      { ...header, status: ReceiptStatus.PARSED, ...CLEARED_FAILURE },
      lines,
    );
    if (!receipt) throw new NotFoundError(`No receipt with id ${id}`);
    return receipt;
  }

  async function updateReceiptLineMatch(lineId: string, input: ReceiptLineMatchInput) {
    if ((input.sizeAmount === null) !== (input.sizeUnit === null)) {
      throw new ValidationError('sizeAmount and sizeUnit must be given together');
    }
    if (input.sizeAmount !== null && input.sizeAmount <= 0) {
      throw new ValidationError('sizeAmount must be greater than 0');
    }
    const line = await receiptRepository.updateReceiptLineMatch(lineId, input);
    if (!line) throw new NotFoundError(`No receipt line with id ${lineId}`);
    return line;
  }

  async function updateReceiptLinePriceEntry(lineId: string, priceEntryId: string) {
    const line = await receiptRepository.updateReceiptLinePriceEntry(lineId, priceEntryId);
    if (!line) throw new NotFoundError(`No receipt line with id ${lineId}`);
    return line;
  }

  async function deleteReceipt(id: string) {
    // Read before the delete: the cascade takes the image rows, and with them the paths.
    const images = await receiptRepository.listReceiptImages(id);
    const receipt = await receiptRepository.deleteReceipt(id);
    if (!receipt) throw new NotFoundError(`No receipt with id ${id}`);
    await deletePhotos(images.map((image) => image.path));
    return receipt;
  }

  function recordReceiptFailure(id: string, stage: ReceiptStage, error: string) {
    return updateReceiptOrThrow(id, { status: ReceiptStatus.FAILED, failedStage: stage, error });
  }

  return {
    getReceiptById,
    listReceipts,
    listReceiptImages,
    listReceiptLines,
    readReceiptImage,
    addReceipt,
    updateReceiptStatus,
    updateReceiptOcrText,
    updateReceiptParse,
    updateReceiptLineMatch,
    updateReceiptLinePriceEntry,
    deleteReceipt,
    recordReceiptFailure,
  };
}
