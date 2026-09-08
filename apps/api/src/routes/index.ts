import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Config } from '../config';
import type { OrderService } from '../services/orderService';
import type { ProductService } from '../services/productService';
import type { NotificationService } from '../services/notificationService';
import type { Telegram } from '../integrations/telegram';
import { orderController } from '../controllers/orderController';
import { botController } from '../controllers/botController';
export function routes(config: Config, orders: OrderService, products: ProductService, notifications: NotificationService, telegram: Telegram) {
  const router = Router();
  router.get('/config', (_req, res) => { res.json({ success: true, data: config.publicConfig }); });
  router.get('/products', async (req, res) => {
    const district = typeof req.query.district === 'string' ? req.query.district : undefined;
    res.json({ success: true, data: await products.list(district) });
  });
  router.post('/orders', rateLimit({ windowMs: 60000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } } }),
    orderController(config, orders, notifications));
  router.post('/telegram/webhook', botController(config, telegram, orders));
  return router;
}

