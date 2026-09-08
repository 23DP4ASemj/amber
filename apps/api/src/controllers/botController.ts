import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config';
import type { Telegram } from '../integrations/telegram';
import type { OrderService } from '../services/orderService';
import { AppError } from '../utils/errors';
const updateSchema = z.object({
  update_id: z.number().int(),
  message: z.object({ text: z.string().optional(), chat: z.object({ id: z.number().int(), type: z.string() }) }).optional(),
  callback_query: z.object({ id: z.string(), data: z.string().optional(), from: z.object({ id: z.number().int() }),
    message: z.object({ chat: z.object({ id: z.number().int() }) }).optional() }).optional(),
});
export function botController(config: Config, telegram: Telegram, orders: OrderService) {
  return async (req: Request, res: Response) => {
    const incoming = Buffer.from(req.get('X-Telegram-Bot-Api-Secret-Token') ?? '');
    const expected = Buffer.from(config.env.TELEGRAM_WEBHOOK_SECRET);
    if (!expected.length || incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook secret.');
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'INVALID_UPDATE', 'Invalid Telegram update.');
    const update = parsed.data;
    if (update.message?.chat.type === 'private' && /^\/start(?:@\w+)?(?:\s|$)/.test(update.message.text ?? '')) {
      await telegram.openShop(update.message.chat.id);
    }
    const callback = update.callback_query;
    if (callback) {
      let message = 'Unknown action.';
      if (!config.adminIds.includes(callback.from.id) || String(callback.message?.chat.id) !== config.env.TELEGRAM_ADMIN_CHAT_ID) {
        message = 'You are not authorized to update orders.';
      } else {
        const match = /^(AS-\d{6}-[A-F0-9]{10}):(CONFIRMED|PROCESSING|READY|COMPLETED)$/.exec(callback.data ?? '');
        if (match) {
          try {
            await orders.changeStatus(match[1], z.enum(['CONFIRMED','PROCESSING','READY','COMPLETED']).parse(match[2]));
            message = 'Order status: ' + match[2];
          } catch (error) {
            if (error instanceof AppError && error.status < 500) message = error.message;
            else throw error;
          }
        }
      }
      await telegram.call('answerCallbackQuery', { callback_query_id: callback.id, text: message });
    }
    res.json({ success: true });
  };
}

