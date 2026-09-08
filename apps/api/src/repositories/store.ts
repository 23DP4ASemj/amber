import type { Product, Order, OrderStatus } from '../../../../shared/types';
export interface ProductRow { product: Product; row: number }
export interface StockUpdate { product_id: string; row: number; available: number }
export interface Store {
  getProducts(): Promise<ProductRow[]>;
  getOrders(): Promise<Order[]>;
  commitOrder(order: Order, stock: StockUpdate[]): Promise<void>;
  updateOrder(orderId: string, changes: Partial<Pick<Order, 'status' | 'customer_notified' | 'admin_notified'>>): Promise<void>;
  assertWritable(): Promise<void>;
}
export type StatusChange = { orderId: string; status: OrderStatus };

