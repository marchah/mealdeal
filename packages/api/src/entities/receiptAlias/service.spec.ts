import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../common/errors';
import type { Maybe } from '../../common/types';
import { Unit } from '../../common/units';
import { receiptAliasMatchKey, receiptAliasServiceFactory } from './service';
import type {
  NewReceiptAlias,
  ReceiptAlias,
  ReceiptAliasRepository,
  UpsertReceiptAliasInput,
} from './types';

// Every printed row below is synthetic — invented store abbreviations, never a real receipt.

const key = (printedText: string, itemNumber: Maybe<string> = null) =>
  receiptAliasMatchKey({ itemNumber, printedText });

describe('receiptAliasMatchKey', () => {
  it('keys on the item number when the row prints one', () => {
    expect(key('Org Black Beans', '717662')).toBe('item:717662');
  });

  it('matches two printings of one row that OCR read differently (docs/PLAN.md decision 5)', () => {
    // The motivating case: one product, two rows, the text read two ways, the number read once.
    expect(key('0rg Black Beans', '717662')).toBe(key('Org Black Beans', '717662'));
    expect(key('0rg Black Beans')).toBe(key('Org Black Beans'));
  });

  it('pins the stored form, since learned names are looked up by it', () => {
    expect(key('KS PPR TWL')).toBe('text:kspprtwl');
    expect(key('Org Black Beans')).toBe('text:orgblackbeans');
    expect(key('MILK 1 GAL')).toBe('text:mllklgal');
    expect(key('anything', ' 70 1 ')).toBe('item:701');
  });

  it('folds the 0 / O look-alikes in printed text', () => {
    expect(key('C0RN FLAKES')).toBe(key('CORN FLAKES'));
    expect(key('corn flakes')).toBe(key('c0rn flakes'));
  });

  it('folds the 1 / l / I look-alikes in printed text, whatever the case', () => {
    const milk = key('MILK 1GAL');
    expect(key('M1LK 1GAL')).toBe(milk);
    expect(key('MlLK lGAL')).toBe(milk);
    expect(key('Milk IGal')).toBe(milk);
    expect(key('M|LK 1GAL')).toBe(milk);
  });

  it('ignores case', () => {
    expect(key('ks ppr twl')).toBe(key('KS PPR TWL'));
    expect(key('Ks Ppr Twl')).toBe(key('KS PPR TWL'));
  });

  it('ignores whitespace, which OCR splits and merges between columns', () => {
    const towels = key('KS PPR TWL');
    expect(key('KS  PPR\tTWL')).toBe(towels);
    expect(key('  KS PPR TWL  ')).toBe(towels);
    expect(key('KS PPRTWL')).toBe(towels);
  });

  it('folds compatibility forms, so full-width characters match their ASCII twins', () => {
    expect(key('ＫＳ ＰＰＲ ＴＷＬ')).toBe(key('KS PPR TWL'));
  });

  it('keeps genuinely different rows apart', () => {
    expect(key('KS PPR TWL')).not.toBe(key('KS BATH TSU'));
    expect(key('MILK 2% GAL')).not.toBe(key('MILK 1% GAL'));
    // Punctuation is kept: a half gallon is not twelve gallons.
    expect(key('MILK 1/2 GAL')).not.toBe(key('MILK 12 GAL'));
  });

  it('folds look-alikes in an item number toward digits', () => {
    expect(key('x', '7l7662')).toBe(key('x', '717662'));
    expect(key('x', '7I7662')).toBe(key('x', '717662'));
    expect(key('x', '71O662')).toBe(key('x', '710662'));
    expect(key('x', '717 662')).toBe(key('x', '717662'));
  });

  it('ignores the printed text once there is an item number', () => {
    expect(key('Org Black Beans', '717662')).toBe(key('Black Bns Organic', '717662'));
  });

  it('falls back to the printed text when the item number is blank', () => {
    expect(key('BAG FEE', '')).toBe(key('BAG FEE'));
    expect(key('BAG FEE', '   ')).toBe(key('BAG FEE'));
  });

  it('never lets an item number collide with printed text that happens to be digits', () => {
    expect(key('x', '123456')).not.toBe(key('123456'));
  });

  it('has nothing to key on when both are blank', () => {
    expect(key('')).toBeNull();
    expect(key(' \t ')).toBeNull();
    expect(key('', ' ')).toBeNull();
  });
});

const makeAlias = (over: Partial<ReceiptAlias> = {}): ReceiptAlias => ({
  id: 'alias-1',
  merchantId: 'merchant-1',
  matchKey: 'item:717662',
  printedText: 'Org Black Beans',
  pantryItemId: 'item-1',
  sizeAmount: 15,
  sizeUnit: Unit.OUNCE,
  ignored: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

const makeInput = (over: Partial<UpsertReceiptAliasInput> = {}): UpsertReceiptAliasInput => ({
  merchantId: 'merchant-1',
  itemNumber: '717662',
  printedText: 'Org Black Beans',
  pantryItemId: 'item-1',
  sizeAmount: 15,
  sizeUnit: Unit.OUNCE,
  ignored: false,
  ...over,
});

function makeService(over: { found?: Maybe<ReceiptAlias>; deleted?: Maybe<ReceiptAlias> } = {}) {
  const findReceiptAliasByMatchKey = vi.fn((_merchantId: string, _matchKey: string) =>
    Promise.resolve(over.found === undefined ? makeAlias() : over.found),
  );
  const upsertReceiptAlias = vi.fn((alias: NewReceiptAlias) =>
    Promise.resolve(makeAlias({ ...alias })),
  );
  const deleteReceiptAlias = vi.fn((id: string) =>
    Promise.resolve(over.deleted === undefined ? makeAlias({ id }) : over.deleted),
  );
  const receiptAliasRepository: ReceiptAliasRepository = {
    findReceiptAliasByMatchKey,
    upsertReceiptAlias,
    deleteReceiptAlias,
  };
  return {
    service: receiptAliasServiceFactory({ receiptAliasRepository }),
    findReceiptAliasByMatchKey,
    upsertReceiptAlias,
  };
}

describe('receiptAliasService.findReceiptAliasByLine', () => {
  it('looks the row up by store and match key', async () => {
    const { service, findReceiptAliasByMatchKey } = makeService();

    const alias = await service.findReceiptAliasByLine('merchant-1', {
      itemNumber: '717662',
      printedText: 'Org Black Beans',
    });

    expect(alias?.id).toBe('alias-1');
    expect(findReceiptAliasByMatchKey).toHaveBeenCalledWith('merchant-1', 'item:717662');
  });

  it('finds the same learned name for a row OCR read differently', async () => {
    const { service, findReceiptAliasByMatchKey } = makeService();

    await service.findReceiptAliasByLine('merchant-1', {
      itemNumber: null,
      printedText: 'Org Black Beans',
    });
    await service.findReceiptAliasByLine('merchant-1', {
      itemNumber: null,
      printedText: '0rg  Black Beans',
    });

    const [first, second] = findReceiptAliasByMatchKey.mock.calls;
    expect(first).toEqual(second);
  });

  it('answers null when nothing is learned for the row', async () => {
    const { service } = makeService({ found: null });
    await expect(
      service.findReceiptAliasByLine('merchant-1', { itemNumber: null, printedText: 'NEW THING' }),
    ).resolves.toBeNull();
  });

  it('answers null without a query for a row with nothing to key on', async () => {
    const { service, findReceiptAliasByMatchKey } = makeService();

    await expect(
      service.findReceiptAliasByLine('merchant-1', { itemNumber: null, printedText: '  ' }),
    ).resolves.toBeNull();
    expect(findReceiptAliasByMatchKey).not.toHaveBeenCalled();
  });
});

describe('receiptAliasService.upsertReceiptAlias', () => {
  it('stores the match key it computed and the trimmed printed text', async () => {
    const { service, upsertReceiptAlias } = makeService();

    await service.upsertReceiptAlias(makeInput({ printedText: '  Org Black Beans ' }));

    expect(upsertReceiptAlias).toHaveBeenCalledWith({
      merchantId: 'merchant-1',
      matchKey: 'item:717662',
      printedText: 'Org Black Beans',
      pantryItemId: 'item-1',
      sizeAmount: 15,
      sizeUnit: Unit.OUNCE,
      ignored: false,
    });
  });

  it('keys on the printed text when the row has no item number', async () => {
    const { service, upsertReceiptAlias } = makeService();

    await service.upsertReceiptAlias(makeInput({ itemNumber: null, printedText: 'KS PPR TWL' }));

    expect(upsertReceiptAlias.mock.calls[0]?.[0].matchKey).toBe('text:kspprtwl');
  });

  it('learns an item without a pack size', async () => {
    const { service, upsertReceiptAlias } = makeService();

    await service.upsertReceiptAlias(makeInput({ sizeAmount: null, sizeUnit: null }));

    expect(upsertReceiptAlias.mock.calls[0]?.[0]).toMatchObject({
      sizeAmount: null,
      sizeUnit: null,
    });
  });

  it('learns an ignore: no item, no size', async () => {
    const { service, upsertReceiptAlias } = makeService();

    await service.upsertReceiptAlias(
      makeInput({
        itemNumber: null,
        printedText: 'BAG FEE',
        pantryItemId: null,
        sizeAmount: null,
        sizeUnit: null,
        ignored: true,
      }),
    );

    expect(upsertReceiptAlias.mock.calls[0]?.[0]).toMatchObject({
      matchKey: 'text:bagfee',
      pantryItemId: null,
      ignored: true,
    });
  });

  it.each<[string, Partial<UpsertReceiptAliasInput>]>([
    ['blank printed text', { printedText: '   ' }],
    ['blank printed text, even with an item number', { printedText: '', itemNumber: '717662' }],
    ['both an item and an ignore', { ignored: true, sizeAmount: null, sizeUnit: null }],
    ['neither an item nor an ignore', { pantryItemId: null, sizeAmount: null, sizeUnit: null }],
    ['a size without its unit', { sizeUnit: null }],
    ['a unit without its size', { sizeAmount: null }],
    [
      'a pack size on an ignore',
      { pantryItemId: null, ignored: true, sizeAmount: 1, sizeUnit: Unit.COUNT },
    ],
    ['a zero pack size', { sizeAmount: 0 }],
    ['a negative pack size', { sizeAmount: -2 }],
  ])('refuses %s, and stores nothing', async (_case, over) => {
    const { service, upsertReceiptAlias } = makeService();

    await expect(service.upsertReceiptAlias(makeInput(over))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(upsertReceiptAlias).not.toHaveBeenCalled();
  });
});

describe('receiptAliasService.deleteReceiptAlias', () => {
  it('returns the deleted alias', async () => {
    const { service } = makeService();
    await expect(service.deleteReceiptAlias('alias-9')).resolves.toMatchObject({ id: 'alias-9' });
  });

  it('reports deleting an unknown alias as not found', async () => {
    const { service } = makeService({ deleted: null });
    await expect(service.deleteReceiptAlias('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
