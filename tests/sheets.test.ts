import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { SheetsStore } from '../apps/api/src/repositories/sheetsStore';
import { WriteJournal } from '../apps/api/src/repositories/writeJournal';
import { GoogleSheets, cell } from '../apps/api/src/integrations/googleSheets';
import { fixture, orderBody, testConfig } from './helpers';
async function cleanup(directory: string) {
  if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('ambersmoke-test-')) throw new Error('Unsafe test cleanup path');
  await rm(directory, { recursive: true, force: true });
}
describe('Atomic Sheets persistence', () => {
  it('puts order and stock updates into one batch and preserves a durable barrier on unknown outcomes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ambersmoke-test-'));
    try {
      const google = new GoogleSheets(testConfig());
      vi.spyOn(google, 'metadata').mockResolvedValue({ sheets: [{ properties: { title: 'Products', sheetId: 11 } }, { properties: { title: 'Orders', sheetId: 22 } }] });
      const batch = vi.spyOn(google, 'batch').mockRejectedValueOnce(new Error('Response lost'));
      const store = new SheetsStore(google, new WriteJournal(directory));
      const f = fixture(); const { order } = await f.orders.processOrderAtomically(orderBody(), { id: 42, first_name: '=IMPORTXML("unsafe")' });
      await expect(store.commitOrder(order, [{ product_id: 'P001', row: 1, available: 11 }])).rejects.toThrow();
      const sent = batch.mock.calls[0][0];
      expect(sent).toHaveLength(2);
      expect(sent[0]).toMatchObject({ updateCells: { range: { sheetId: 11, startColumnIndex: 8 }, rows: [{ values: [cell(11)] }] } });
      expect(sent[1]).toMatchObject({ appendCells: { sheetId: 22 } });
      expect(JSON.stringify(sent)).not.toContain('formulaValue');
      const restarted = new SheetsStore(google, new WriteJournal(directory));
      await expect(restarted.assertWritable()).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
      expect(batch).toHaveBeenCalledTimes(1);
    } finally { await cleanup(directory); }
  });
  it('clears the journal only after a confirmed write', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ambersmoke-test-'));
    try {
      const google = new GoogleSheets(testConfig());
      vi.spyOn(google, 'metadata').mockResolvedValue({ sheets: [{ properties: { title: 'Products', sheetId: 1 } }, { properties: { title: 'Orders', sheetId: 2 } }] });
      vi.spyOn(google, 'batch').mockResolvedValue({});
      const journal = new WriteJournal(directory); const store = new SheetsStore(google, journal);
      const f = fixture(); const { order } = await f.orders.processOrderAtomically(orderBody(), { id: 42, first_name: 'Test' });
      await store.commitOrder(order, [{ product_id: 'P001', row: 1, available: 11 }]);
      expect(await journal.pending()).toBeNull();
    } finally { await cleanup(directory); }
  });
});
