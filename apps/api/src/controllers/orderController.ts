import type { Request, Response } from 'express';
import type { Config } from '../config';
import { orderRequestSchema } from '../../../../shared/schemas';
import { validateTelegramInitData } from '../utils/validateTelegramInitData';
import { AppError } from '../utils/errors';
import { confirmOrder, type OrderService } from '../services/orderService';
import type { NotificationService } from '../services/notificationService';
export function orderController(config: Config, orders: OrderService, notifications: NotificationService) {
  return async (req: Request, res: Response) => {
    const header = req.get('Authorization') ?? '';
    const user = config.env.DEMO_MODE && !header
      ? { id: 1000001, first_name: 'Demo visitor', username: 'demo_visitor' }
      : validateTelegramInitData(header.startsWith('tma ') ? header.slice(4) : '', config.env.TELEGRAM_BOT_TOKEN, config.env.INIT_DATA_MAX_AGE_SECONDS);
    const body = orderRequestSchema.safeParse(req.body);
    if (!body.success) throw new AppError(400, 'INVALID_ORDER', 'Check your items, delivery district and age confirmation.');
    const { order, created } = await orders.processOrderAtomically(body.data, user);
    res.status(created ? 201 : 200).json({ success: true, data: confirmOrder(order) });
    void notifications.drain();
  };
}

