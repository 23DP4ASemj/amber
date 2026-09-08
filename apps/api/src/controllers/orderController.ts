import { Request, Response } from 'express';
import { orderRequestSchema } from '../../../../shared/schemas';
import { sendOrderNotification, OrderData } from '../services/notificationService';

export async function handleCreateOrder(req: Request, res: Response) {
  try {
    const parsed = orderRequestSchema.safeParse(req.body);
    const body = parsed.success ? parsed.data : req.body;

    const items = body.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    const location = body.location || body.address || 'Centrs';

    const orderData: OrderData = {
      telegramId: body.telegramId ? String(body.telegramId) : 'Не определен',
      username: body.username || '',
      firstName: body.firstName || body.customerName || 'Покупатель',
      location,
      comment: body.comment || '',
      items: items.map((i: any) => ({
        id: String(i.id || ''),
        name: String(i.name || 'Товар'),
        price: Number(i.price || 0),
        quantity: Number(i.quantity || 1),
        subtotal: Number(i.subtotal || i.price * i.quantity || 0),
      })),
      total: Number(body.total) || items.reduce((acc: number, cur: any) => acc + (cur.price * cur.quantity), 0),
    };

    await sendOrderNotification(orderData);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Ошибка создания заказа:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}