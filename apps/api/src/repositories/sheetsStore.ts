import type { Order } from '../../../../shared/types';
import type { Store, StockUpdate } from './store';
import { GoogleSheets, cell } from '../integrations/googleSheets';
import { productHeaders, orderHeaders, assertHeaders, parseProduct, parseOrder, orderValues } from './sheetSchema';
import { WriteJournal } from './writeJournal';
import { AppError } from '../utils/errors';
export class SheetsStore implements Store {
  constructor(private sheets: GoogleSheets, readonly journal: WriteJournal) {}
  async assertWritable() { await this.journal.assertClear(); }
  private async ids() {
    const meta = await this.sheets.metadata();
    const products = meta.sheets.find(s => s.properties.title === 'Products')?.properties.sheetId;
    const orders = meta.sheets.find(s => s.properties.title === 'Orders')?.properties.sheetId;
    if (products === undefined || orders === undefined) throw new AppError(503, 'SHEET_SCHEMA_ERROR', 'Products and Orders sheets must exist.');
    return { products, orders };
  }
  async getProducts() {
    const { values = [] } = await this.sheets.values('Products!A:M');
    assertHeaders(values[0] ?? [], productHeaders);
    const rows = values.slice(1).map((row, i) => ({ row: i + 1, values: row })).filter(r => r.values.some(v => v !== ''));
    const result = rows.map(r => ({ row: r.row, product: parseProduct(r.values) }));
    if (new Set(result.map(r => r.product.id)).size !== result.length) throw new AppError(503, 'SHEET_SCHEMA_ERROR', 'Product IDs must be unique.');
    return result;
  }
  private async orderRows() {
    const { values = [] } = await this.sheets.values('Orders!A:N');
    assertHeaders(values[0] ?? [], orderHeaders);
    return values.slice(1).map((row, i) => ({ row: i + 1, values: row })).filter(r => r.values.some(v => v !== ''))
      .map(r => ({ row: r.row, order: parseOrder(r.values) }));
  }
  async getOrders() { return (await this.orderRows()).map(r => r.order); }
  private async guardedBatch(requests: unknown[], operation: unknown) {
    await this.assertWritable();
    await this.journal.begin(operation);
    // No automatic retries: a timeout may mean the atomic write succeeded.
    await this.sheets.batch(requests);
    await this.journal.clear();
  }
  async commitOrder(order: Order, stock: StockUpdate[]) {
    const ids = await this.ids();
    const requests: unknown[] = stock.map(update => ({
      updateCells: { range: { sheetId: ids.products, startRowIndex: update.row, endRowIndex: update.row + 1, startColumnIndex: 8, endColumnIndex: 9 },
        rows: [{ values: [cell(update.available)] }], fields: 'userEnteredValue' },
    }));
    requests.push({ appendCells: { sheetId: ids.orders, rows: [{ values: orderValues(order).map(cell) }], fields: 'userEnteredValue' } });
    await this.guardedBatch(requests, { kind: 'create_order', order_id: order.order_id, client_order_id: order.client_order_id, stock });
  }
  async updateOrder(orderId: string, changes: Partial<Pick<Order, 'status' | 'customer_notified' | 'admin_notified'>>) {
    const ids = await this.ids();
    const found = (await this.orderRows()).find(r => r.order.order_id === orderId);
    if (!found) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const indexes = { status: 9, customer_notified: 12, admin_notified: 13 };
    const requests = Object.entries(changes).map(([key, value]) => {
      const column = indexes[key as keyof typeof indexes];
      return { updateCells: { range: { sheetId: ids.orders, startRowIndex: found.row, endRowIndex: found.row + 1, startColumnIndex: column, endColumnIndex: column + 1 },
        rows: [{ values: [cell(value)] }], fields: 'userEnteredValue' } };
    });
    await this.guardedBatch(requests, { kind: 'update_order', order_id: orderId, changes });
  }
}

