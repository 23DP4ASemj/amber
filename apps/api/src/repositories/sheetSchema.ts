import { z } from 'zod';
import type { Order, Product } from '../../../../shared/types';
import { AppError } from '../utils/errors';
export const productHeaders = ['id','sku','category','brand','name','flavor','description','price','available','image_url','active','sort_order','blocked_districts'];
export const orderHeaders = ['order_id','created_at','telegram_user_id','telegram_username','first_name','district','items_json','subtotal','total','status','client_order_id','request_hash','customer_notified','admin_notified'];
const productSchema = z.object({
  id: z.string().min(1).max(80), sku: z.string(), category: z.string().min(1), brand: z.string(), name: z.string().min(1).max(160),
  flavor: z.string().max(120), description: z.string().max(2000), price: z.number().min(0).max(100000),
  available: z.number().int().min(0).max(1000000), image_url: z.string().refine(v => v === '' || /^https:\/\//.test(v) || /^\/products\/[a-z0-9-]+\.svg$/.test(v)),
  active: z.boolean(), sort_order: z.number().finite(), blocked_districts: z.array(z.string()),
});
const statusSchema = z.enum(['NEW','CONFIRMED','PROCESSING','READY','COMPLETED','CANCELLED']);
const orderSchema = z.object({
  order_id: z.string().min(1), created_at: z.iso.datetime(), telegram_user_id: z.number().int().positive(),
  telegram_username: z.string(), first_name: z.string(), district: z.string(), items: z.array(z.object({
    product_id: z.string(), name: z.string(), flavor: z.string(), qty: z.number().int().positive(), unit_price: z.number().nonnegative(), line_total: z.number().nonnegative(),
  })).min(1), subtotal: z.number().nonnegative(), total: z.number().nonnegative(), status: statusSchema,
  client_order_id: z.uuid(), request_hash: z.string().length(64), customer_notified: z.boolean(), admin_notified: z.boolean(),
});
function boolean(value: unknown) { return value === true || value === 'TRUE'; }
const string = (v: unknown) => String(v ?? '');
export function assertHeaders(row: unknown[], expected: string[]) {
  if (expected.some((header, i) => row[i] !== header)) throw new AppError(503, 'SHEET_SCHEMA_ERROR', 'The shop data needs administrator attention.');
}
export function parseProduct(row: unknown[]): Product {
  const parsed = productSchema.safeParse({
    id: string(row[0]), sku: string(row[1]), category: string(row[2]), brand: string(row[3]), name: string(row[4]),
    flavor: string(row[5]), description: string(row[6]), price: row[7] === '' || row[7] == null ? NaN : Number(row[7]),
    available: row[8] === '' || row[8] == null ? NaN : Number(row[8]), image_url: string(row[9]), active: boolean(row[10]),
    sort_order: Number(row[11] ?? 0), blocked_districts: string(row[12]).split(',').map(s => s.trim()).filter(Boolean),
  });
  if (!parsed.success || Math.abs(parsed.data.price * 100 - Math.round(parsed.data.price * 100)) > 0.00001) {
    throw new AppError(503, 'SHEET_SCHEMA_ERROR', 'A product row contains invalid data.');
  }
  return parsed.data;
}
export function parseOrder(row: unknown[]): Order {
  try {
    return orderSchema.parse({ order_id: string(row[0]), created_at: string(row[1]), telegram_user_id: Number(row[2]),
      telegram_username: string(row[3]), first_name: string(row[4]), district: string(row[5]), items: JSON.parse(string(row[6])),
      subtotal: Number(row[7]), total: Number(row[8]), status: row[9], client_order_id: row[10], request_hash: row[11],
      customer_notified: boolean(row[12]), admin_notified: boolean(row[13]) });
  } catch { throw new AppError(503, 'SHEET_SCHEMA_ERROR', 'An order row contains invalid data.'); }
}
export function orderValues(order: Order): (string | number | boolean)[] {
  return [order.order_id, order.created_at, order.telegram_user_id, order.telegram_username, order.first_name, order.district,
    JSON.stringify(order.items), order.subtotal, order.total, order.status, order.client_order_id, order.request_hash, order.customer_notified, order.admin_notified];
}

