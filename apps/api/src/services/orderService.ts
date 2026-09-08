import { createHash, randomBytes } from 'node:crypto';
import type { Order, OrderRequest, OrderStatus, TelegramUser, OrderConfirmation } from '../../../../shared/types';
import type { Config } from '../config';
import type { AgeVerifier } from '../config/compliance';
import { isVisible } from '../config/compliance';
import type { Store, StockUpdate } from '../repositories/store';
import { Mutex } from '../utils/mutex';
import { AppError } from '../utils/errors';
export function confirmOrder(order: Order): OrderConfirmation {
  const { order_id, created_at, district, items, subtotal, total, status } = order;
  return { order_id, created_at, district, items, subtotal, total, status };
}
export class OrderService {
  readonly mutex = new Mutex();
  constructor(readonly store: Store, private config: Config, private ageVerifier: AgeVerifier) {}
  async processOrderAtomically(request: OrderRequest, user: TelegramUser) {
    const canonical = { district: request.district, items: [...request.items].sort((a, b) => a.product_id.localeCompare(b.product_id)) };
    const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    return this.mutex.run(async () => {
      const orders = await this.store.getOrders();
      const existing = orders.find(o => o.client_order_id === request.client_order_id);
      if (existing) {
        if (existing.telegram_user_id !== user.id || existing.request_hash !== hash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This checkout identifier was already used for a different order.');
        return { order: existing, created: false };
      }
      await this.store.assertWritable();
      if (!this.config.publicConfig.districts.includes(request.district)) throw new AppError(400, 'INVALID_DISTRICT', 'Choose a valid delivery district.');
      if (this.config.publicConfig.compliance.blockedDistricts.includes(request.district)) throw new AppError(403, 'REGION_RESTRICTED', 'Checkout is unavailable in this district.');
      await this.ageVerifier.verify(user, request);
      const products = await this.store.getProducts();
      const stock: StockUpdate[] = [];
      const items = request.items.map(item => {
        const found = products.find(p => p.product.id === item.product_id);
        if (!found || !isVisible(found.product, this.config, request.district)) throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'An item is no longer available in your district. Please review your bag.');
        const p = found.product;
        if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > p.available) throw new AppError(409, 'OUT_OF_STOCK', 'Stock has changed. Please review the quantities in your bag.');
        stock.push({ product_id: p.id, row: found.row, available: p.available - item.qty });
        return { product_id: p.id, name: p.name, flavor: p.flavor, qty: item.qty, unit_price: p.price, line_total: Math.round(p.price * 100) * item.qty / 100 };
      });
      const total = items.reduce((sum, item) => sum + Math.round(item.line_total * 100), 0) / 100;
      let orderId: string;
      do { orderId = 'AS-' + new Date().toISOString().slice(2, 10).replaceAll('-', '') + '-' + randomBytes(5).toString('hex').toUpperCase(); }
      while (orders.some(order => order.order_id === orderId));
      const order: Order = { order_id: orderId, client_order_id: request.client_order_id, created_at: new Date().toISOString(),
        telegram_user_id: user.id, telegram_username: user.username ?? '', first_name: user.first_name,
        district: request.district, items, subtotal: total, total, status: 'NEW', request_hash: hash, customer_notified: false, admin_notified: false };
      await this.store.commitOrder(order, stock);
      return { order, created: true };
    });
  }
  async changeStatus(orderId: string, status: OrderStatus) {
    return this.mutex.run(async () => {
      await this.store.assertWritable();
      const order = (await this.store.getOrders()).find(o => o.order_id === orderId);
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (order.status === status) return;
      const next: Partial<Record<OrderStatus, OrderStatus>> = { NEW: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'READY', READY: 'COMPLETED' };
      if (next[order.status] !== status) throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Use the next status in the order workflow.');
      await this.store.updateOrder(orderId, { status });
    });
  }
}
