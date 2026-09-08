import axios from 'axios';

export interface OrderItem {
  id?: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface OrderData {
  telegramId: string;
  username?: string;
  firstName: string;
  location: string;
  comment?: string;
  items: OrderItem[];
  total: number;
}

export async function sendOrderNotification(order: OrderData): Promise<void> {
  const token = process.env.BOT_TOKEN;
  const adminChatId = process.env.ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.warn('BOT_TOKEN или ADMIN_CHAT_ID не заданы в переменных окружения.');
    return;
  }

  const itemsText = order.items
    .map((it) => `▫️ <b>${it.name}</b> — ${it.quantity} шт. (${it.subtotal} €)`)
    .join('\n');

  const userMention = order.username
    ? `${order.username} (ID: <code>${order.telegramId}</code>)`
    : `<a href="tg://user?id=${order.telegramId}">${order.firstName}</a> (ID: <code>${order.telegramId}</code>)`;

  const message = `
📦 <b>НОВЫЙ ЗАКАЗ</b>

📍 <b>Локация:</b> <u>${order.location}</u>
👤 <b>Клиент:</b> ${userMention}
💬 <b>Комментарий:</b> ${order.comment || 'Нет'}

🛍 <b>Состав заказа:</b>
${itemsText}

💰 <b>Итого к оплате:</b> <b>${order.total} €</b>
  `.trim();

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: adminChatId,
      text: message,
      parse_mode: 'HTML',
    });
  } catch (err: any) {
    console.error('Ошибка отправки сообщения в Telegram:', err.response?.data || err.message);
  }
}

// Экспорт класса для app.ts
export class NotificationService {
  async notifyNewOrder(order: any) {
    return sendOrderNotification(order);
  }

  async sendOrderNotification(order: OrderData) {
    return sendOrderNotification(order);
  }
}

// Экспорт экземпляра и функции
export const notificationService = new NotificationService();
export default notificationService;