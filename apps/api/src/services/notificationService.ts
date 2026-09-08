import type { Telegram } from '../integrations/telegram';
import type { OrderService } from './orderService';
import { logFailure } from '../utils/errors';
export class NotificationService {
  private running = false;
  constructor(private orders: OrderService, private telegram: Telegram) {}
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.orders.mutex.run(async () => {
        await this.orders.store.assertWritable();
        return (await this.orders.store.getOrders()).filter(o => !o.customer_notified || !o.admin_notified).slice(0, 10);
      });
      for (const order of pending) {
        for (const audience of ['customer', 'admin'] as const) {
          const field = audience === 'customer' ? 'customer_notified' : 'admin_notified';
          if (order[field]) continue;
          try {
            await this.telegram.notify(order, audience);
            await this.orders.mutex.run(async () => {
              await this.orders.store.assertWritable();
              await this.orders.store.updateOrder(order.order_id, { [field]: true });
            });
          } catch (error) { logFailure('notification_failed_' + audience, error, order.order_id); }
        }
      }
    } catch (error) { logFailure('notification_worker_failed', error); }
    finally { this.running = false; }
  }
}

