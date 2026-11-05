import { randomUUID } from 'node:crypto';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { ServerError } from '../../common/errors';
import { receiptImages, receiptLines, receipts } from '../../db/schema';
import type { Db } from '../../db/client';
import {
  ReceiptLineDecision,
  type ListReceiptsInput,
  type NewReceipt,
  type ParsedReceiptLine,
  type ReceiptLineMatchInput,
  type ReceiptRepository,
  type ReceiptUpdate,
} from './types';

// The ONLY layer that imports the db. Composes Drizzle queries into the ReceiptRepository port.
//
// Multi-statement writes go through db.batch, not db.transaction: libsql runs a batch as one
// transaction on the shared connection without yielding, whereas a transaction holds its own
// connection across awaits, where a request writing meanwhile can hit SQLITE_BUSY.
export function receiptRepositoryFactory({ db }: { db: Db }): ReceiptRepository {
  async function findReceiptById(id: string) {
    const rows = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async function listReceipts(input: ListReceiptsInput) {
    if (input.statuses !== null && input.statuses.length === 0) return [];
    return (
      db
        .select()
        .from(receipts)
        .where(input.statuses === null ? undefined : inArray(receipts.status, [...input.statuses]))
        // created_at is in seconds; the id only makes a same-second tie stable.
        .orderBy(desc(receipts.createdAt), asc(receipts.id))
    );
  }

  async function listReceiptImages(receiptId: string) {
    return db
      .select()
      .from(receiptImages)
      .where(eq(receiptImages.receiptId, receiptId))
      .orderBy(asc(receiptImages.position));
  }

  async function listReceiptLines(receiptId: string) {
    return db
      .select()
      .from(receiptLines)
      .where(eq(receiptLines.receiptId, receiptId))
      .orderBy(asc(receiptLines.position));
  }

  async function insertReceipt(receipt: NewReceipt) {
    const id = randomUUID();
    const insertRow = db
      .insert(receipts)
      .values({ id, status: receipt.status, imageHash: receipt.imageHash })
      .returning();
    const [rows] =
      receipt.images.length === 0
        ? [await insertRow]
        : await db.batch([
            insertRow,
            db.insert(receiptImages).values(
              receipt.images.map((image, position) => ({
                id: randomUUID(),
                receiptId: id,
                position,
                ...image,
              })),
            ),
          ]);
    const inserted = rows[0];
    if (!inserted) throw new ServerError('insertReceipt returned no row');
    return inserted;
  }

  async function updateReceipt(id: string, update: ReceiptUpdate) {
    const rows = await db.update(receipts).set(update).where(eq(receipts.id, id)).returning();
    return rows[0] ?? null;
  }

  async function replaceReceiptLines(
    id: string,
    update: ReceiptUpdate,
    lines: readonly ParsedReceiptLine[],
  ) {
    // Checked first because the batch cannot branch: new lines for a missing receipt would fail
    // on the foreign key instead of reading as "no such receipt".
    if (!(await findReceiptById(id))) return null;
    const updateRow = db.update(receipts).set(update).where(eq(receipts.id, id)).returning();
    const deleteLines = db.delete(receiptLines).where(eq(receiptLines.receiptId, id));
    const [rows] =
      lines.length === 0
        ? await db.batch([updateRow, deleteLines])
        : await db.batch([
            updateRow,
            deleteLines,
            db.insert(receiptLines).values(
              lines.map((line, position) => ({
                id: randomUUID(),
                receiptId: id,
                position,
                decision: ReceiptLineDecision.PENDING,
                ...line,
              })),
            ),
          ]);
    return rows[0] ?? null;
  }

  async function updateReceiptLineMatch(lineId: string, match: ReceiptLineMatchInput) {
    const rows = await db
      .update(receiptLines)
      .set(match)
      .where(eq(receiptLines.id, lineId))
      .returning();
    return rows[0] ?? null;
  }

  async function updateReceiptLinePriceEntry(lineId: string, priceEntryId: string) {
    const rows = await db
      .update(receiptLines)
      .set({ priceEntryId })
      .where(eq(receiptLines.id, lineId))
      .returning();
    return rows[0] ?? null;
  }

  async function deleteReceipt(id: string) {
    const rows = await db.delete(receipts).where(eq(receipts.id, id)).returning();
    return rows[0] ?? null;
  }

  return {
    findReceiptById,
    listReceipts,
    listReceiptImages,
    listReceiptLines,
    insertReceipt,
    updateReceipt,
    replaceReceiptLines,
    updateReceiptLineMatch,
    updateReceiptLinePriceEntry,
    deleteReceipt,
  };
}
