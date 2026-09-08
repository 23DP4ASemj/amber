import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { resolve } from 'node:path';
import type { Config } from './config';
import type { Store } from './repositories/store';
import { createAgeVerifier } from './config/compliance';
import { OrderService } from './services/orderService';
import { ProductService } from './services/productService';
import { NotificationService } from './services/notificationService';
import { Telegram } from './integrations/telegram';
import { routes } from './routes';
import { AppError, logFailure } from './utils/errors';
export function createApp(config: Config, store: Store, telegram = new Telegram(config)) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.env.TRUST_PROXY_HOPS);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    'script-src': ["'self'", 'https://telegram.org'], 'img-src': ["'self'", 'data:', 'https:'],
    'style-src': ["'self'", "'unsafe-inline'"], 'connect-src': ["'self'"],
    'frame-ancestors': ["'self'", 'https://web.telegram.org', 'https://*.telegram.org'],
  } }, frameguard: false }));
  app.use(cors({ origin: new URL(config.env.WEBAPP_URL).origin, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Please slow down and try again.' } } }));
  const orders = new OrderService(store, config, createAgeVerifier(config));
  const notifications = new NotificationService(orders, telegram);
  app.get('/health', async (_req, res) => {
    try { await store.assertWritable(); res.json({ status: 'ok' }); }
    catch { res.status(503).json({ status: 'checkout_paused' }); }
  });
  app.use('/api', routes(config, orders, new ProductService(store, config), notifications, telegram));
  app.use('/api', (_req, _res, next) => { next(new AppError(404, 'NOT_FOUND', 'API endpoint not found.')); });
  if (config.env.NODE_ENV === 'production') {
    app.use(express.static(resolve('dist/web')));
    app.get('/{*path}', (_req, res) => { res.sendFile(resolve('dist/web/index.html')); });
  }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const err = error instanceof AppError ? error : error instanceof SyntaxError ? new AppError(400, 'INVALID_JSON', 'Invalid JSON request.')
      : typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request is too large.')
        : new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please retry with the same checkout.');
    if (err.status >= 500) logFailure('request_failed', error);
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
  });
  return { app, orders, notifications };
}

