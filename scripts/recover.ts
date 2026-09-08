import { rename } from 'node:fs/promises';
import { z } from 'zod';
import { readConfig } from '../apps/api/src/config';
import { WriteJournal } from '../apps/api/src/repositories/writeJournal';
import { GoogleSheets } from '../apps/api/src/integrations/googleSheets';
import { SheetsStore } from '../apps/api/src/repositories/sheetsStore';
const config = readConfig();
if (config.env.DEMO_MODE) throw new Error('Recovery is for the real Sheets store, not demo mode.');
const journal = new WriteJournal(config.env.DATA_DIR);
const value = await journal.pending();
if (!value) { console.info('No pending write.'); process.exit(0); }
const pending = z.object({ at: z.iso.datetime(), operation: z.object({ kind: z.string(), order_id: z.string() }).passthrough() }).parse(value);
const store = new SheetsStore(new GoogleSheets(config), journal);
const found = (await store.getOrders()).find(o => o.order_id === pending.operation.order_id);
console.info(JSON.stringify({ pending, orderExists: Boolean(found), status: found?.status,
  customerNotified: found?.customer_notified, adminNotified: found?.admin_notified,
  stock: (await store.getProducts()).map(r => ({ id: r.product.id, available: r.product.available })) }, null, 2));
if (process.argv.includes('--confirm-reconciled')) {
  if (Date.now() - Date.parse(pending.at) < 300000) throw new Error('Wait at least five minutes after the attempted write before reconciliation.');
  // Operator must stop the API and reconcile the displayed data before this explicit command.
  await rename(journal.path, journal.path + '.' + Date.now() + '.reconciled');
  console.info('Journal archived. Restart the single API process and retry the SAME checkout key.');
} else {
  console.info('Read-only report. Stop the API, wait for in-flight requests to settle, verify order and stock together, then run with --confirm-reconciled. See README.');
}

