import {
  GoogleSheets,
  assertHeaders,
  cell,
  orderHeaders,
  orderValues,
  parseOrder,
  parseProduct,
  productHeaders
} from "./chunk-AHBO7CRZ.js";
import {
  AppError,
  readConfig
} from "./chunk-2SDIGB7K.js";

// scripts/recover.ts
import { rename } from "fs/promises";
import { z } from "zod";

// apps/api/src/repositories/writeJournal.ts
import { mkdir, open, readFile, unlink } from "fs/promises";
import { resolve } from "path";
var WriteJournal = class {
  constructor(directory) {
    this.directory = directory;
    this.path = resolve(directory, "pending-write.json");
  }
  directory;
  path;
  async pending() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async assertClear() {
    if (await this.pending() !== null) throw new AppError(503, "RECONCILIATION_REQUIRED", "Checkout is paused while an earlier operation is verified. Please keep your checkout and retry later.");
  }
  async begin(operation) {
    await mkdir(this.directory, { recursive: true });
    const file = await open(this.path, "wx", 384);
    try {
      await file.writeFile(JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), operation }));
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async clear() {
    await unlink(this.path);
  }
};

// apps/api/src/repositories/sheetsStore.ts
var SheetsStore = class {
  constructor(sheets, journal2) {
    this.sheets = sheets;
    this.journal = journal2;
  }
  sheets;
  journal;
  async assertWritable() {
    await this.journal.assertClear();
  }
  async ids() {
    const meta = await this.sheets.metadata();
    const products = meta.sheets.find((s) => s.properties.title === "Products")?.properties.sheetId;
    const orders = meta.sheets.find((s) => s.properties.title === "Orders")?.properties.sheetId;
    if (products === void 0 || orders === void 0) throw new AppError(503, "SHEET_SCHEMA_ERROR", "Products and Orders sheets must exist.");
    return { products, orders };
  }
  async getProducts() {
    const { values = [] } = await this.sheets.values("Products!A:M");
    assertHeaders(values[0] ?? [], productHeaders);
    const rows = values.slice(1).map((row, i) => ({ row: i + 1, values: row })).filter((r) => r.values.some((v) => v !== ""));
    const result = rows.map((r) => ({ row: r.row, product: parseProduct(r.values) }));
    if (new Set(result.map((r) => r.product.id)).size !== result.length) throw new AppError(503, "SHEET_SCHEMA_ERROR", "Product IDs must be unique.");
    return result;
  }
  async orderRows() {
    const { values = [] } = await this.sheets.values("Orders!A:N");
    assertHeaders(values[0] ?? [], orderHeaders);
    return values.slice(1).map((row, i) => ({ row: i + 1, values: row })).filter((r) => r.values.some((v) => v !== "")).map((r) => ({ row: r.row, order: parseOrder(r.values) }));
  }
  async getOrders() {
    return (await this.orderRows()).map((r) => r.order);
  }
  async guardedBatch(requests, operation) {
    await this.assertWritable();
    await this.journal.begin(operation);
    await this.sheets.batch(requests);
    await this.journal.clear();
  }
  async commitOrder(order, stock) {
    const ids = await this.ids();
    const requests = stock.map((update) => ({
      updateCells: {
        range: { sheetId: ids.products, startRowIndex: update.row, endRowIndex: update.row + 1, startColumnIndex: 8, endColumnIndex: 9 },
        rows: [{ values: [cell(update.available)] }],
        fields: "userEnteredValue"
      }
    }));
    requests.push({ appendCells: { sheetId: ids.orders, rows: [{ values: orderValues(order).map(cell) }], fields: "userEnteredValue" } });
    await this.guardedBatch(requests, { kind: "create_order", order_id: order.order_id, client_order_id: order.client_order_id, stock });
  }
  async updateOrder(orderId, changes) {
    const ids = await this.ids();
    const found2 = (await this.orderRows()).find((r) => r.order.order_id === orderId);
    if (!found2) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
    const indexes = { status: 9, customer_notified: 12, admin_notified: 13 };
    const requests = Object.entries(changes).map(([key, value2]) => {
      const column = indexes[key];
      return { updateCells: {
        range: { sheetId: ids.orders, startRowIndex: found2.row, endRowIndex: found2.row + 1, startColumnIndex: column, endColumnIndex: column + 1 },
        rows: [{ values: [cell(value2)] }],
        fields: "userEnteredValue"
      } };
    });
    await this.guardedBatch(requests, { kind: "update_order", order_id: orderId, changes });
  }
};

// scripts/recover.ts
var config = readConfig();
if (config.env.DEMO_MODE) throw new Error("Recovery is for the real Sheets store, not demo mode.");
var journal = new WriteJournal(config.env.DATA_DIR);
var value = await journal.pending();
if (!value) {
  console.info("No pending write.");
  process.exit(0);
}
var pending = z.object({ at: z.iso.datetime(), operation: z.object({ kind: z.string(), order_id: z.string() }).passthrough() }).parse(value);
var store = new SheetsStore(new GoogleSheets(config), journal);
var found = (await store.getOrders()).find((o) => o.order_id === pending.operation.order_id);
console.info(JSON.stringify({
  pending,
  orderExists: Boolean(found),
  status: found?.status,
  customerNotified: found?.customer_notified,
  adminNotified: found?.admin_notified,
  stock: (await store.getProducts()).map((r) => ({ id: r.product.id, available: r.product.available }))
}, null, 2));
if (process.argv.includes("--confirm-reconciled")) {
  if (Date.now() - Date.parse(pending.at) < 3e5) throw new Error("Wait at least five minutes after the attempted write before reconciliation.");
  await rename(journal.path, journal.path + "." + Date.now() + ".reconciled");
  console.info("Journal archived. Restart the single API process and retry the SAME checkout key.");
} else {
  console.info("Read-only report. Stop the API, wait for in-flight requests to settle, verify order and stock together, then run with --confirm-reconciled. See README.");
}
