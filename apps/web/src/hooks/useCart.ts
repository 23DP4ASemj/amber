import { useEffect, useState } from 'react';
import type { CartItem, Product } from '../../../../shared/types';
import { readStorage, writeStorage } from '../lib/storage';
import { haptic } from '../lib/telegram';
export function useCart(products: Product[]) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const stored = readStorage<unknown>('as:cart', []);
    return Array.isArray(stored) ? stored.filter((v): v is CartItem => typeof v === 'object' && v !== null && 'product_id' in v
      && typeof v.product_id === 'string' && 'qty' in v && Number.isInteger(v.qty) && Number(v.qty) > 0 && Number(v.qty) <= 99) : [];
  });
  useEffect(() => { writeStorage('as:cart', items); }, [items]);
  const setQuantity = (productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    const qty = Math.max(0, Math.min(quantity, product?.available ?? 0, 99));
    setItems(previous => qty === 0 ? previous.filter(i => i.product_id !== productId)
      : previous.some(i => i.product_id === productId) ? previous.map(i => i.product_id === productId ? { ...i, qty } : i)
      : [...previous, { product_id: productId, qty }]);
    haptic();
  };
  const add = (product: Product) => {
    setItems(previous => {
      const current = previous.find(i => i.product_id === product.id)?.qty ?? 0;
      if (current >= product.available || current >= 99) return previous;
      return current ? previous.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...previous, { product_id: product.id, qty: 1 }];
    });
    haptic();
  };
  const count = items.reduce((sum, i) => sum + i.qty, 0);
  const total = items.reduce((sum, i) => sum + Math.round((products.find(p => p.id === i.product_id)?.price ?? 0) * 100) * i.qty, 0) / 100;
  return { items, count, total, add, setQuantity, clear: () => setItems([]) };
}
export type Cart = ReturnType<typeof useCart>;

