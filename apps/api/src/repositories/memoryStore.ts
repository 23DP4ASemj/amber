import type { Product, Order } from '../../../../shared/types';
import type { Store, StockUpdate } from './store';
export class MemoryStore implements Store {
  products: Product[];
  orders: Order[] = [];
  constructor(products: Product[]) { this.products = structuredClone(products); }
  async assertWritable() {}
  async getProducts() { return structuredClone(this.products.map((product, i) => ({ product, row: i + 1 }))); }
  async getOrders() { return structuredClone(this.orders); }
  async commitOrder(order: Order, stock: StockUpdate[]) {
    const next = structuredClone(this.products);
    for (const update of stock) next.find(p => p.id === update.product_id)!.available = update.available;
    this.products = next;
    this.orders.push(structuredClone(order));
  }
  async updateOrder(orderId: string, changes: Partial<Pick<Order, 'status' | 'customer_notified' | 'admin_notified'>>) {
    Object.assign(this.orders.find(o => o.order_id === orderId)!, changes);
  }
}

