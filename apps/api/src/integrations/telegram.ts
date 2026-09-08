import type { Config } from '../config';
import type { Order } from '../../../../shared/types';
import { AppError } from '../utils/errors';
export class Telegram {
  constructor(private config: Config) {}
  async call(method: string, body: Record<string, unknown>): Promise<void> {
    if (this.config.env.DEMO_MODE) return;
    try {
      const response = await fetch('https://api.telegram.org/bot' + this.config.env.TELEGRAM_BOT_TOKEN + '/' + method, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== 'object' || !('ok' in payload) || !payload.ok) throw new Error('Telegram API failed');
    } catch { throw new AppError(502, 'TELEGRAM_UNAVAILABLE', 'Telegram could not deliver this message.'); }
  }
  async openShop(chatId: number) {
    await this.call('sendMessage', { chat_id: chatId, text: 'Welcome to ' + this.config.publicConfig.shopName + '.\nSmall rituals. Good living.\nBrowse the collection and place your order in our shop.',
      reply_markup: { inline_keyboard: [[{ text: 'Open Shop', web_app: { url: this.config.env.WEBAPP_URL } }]] } });
  }
  async notify(order: Order, audience: 'customer' | 'admin') {
    const money = (v: number) => '€' + v.toFixed(2);
    const lines = order.items.map(i => i.qty + ' × ' + i.name + ' · ' + i.flavor + ' — ' + money(i.line_total)).join('\n');
    const details = 'Order: #' + order.order_id + '\nDistrict: ' + order.district + '\n\n' + lines + '\n\nTotal: ' + money(order.total);
    const admin = audience === 'admin';
    // Plain text prevents user-controlled names from becoming HTML or Markdown.
    const text = admin ? '🛍 NEW ORDER\n\n' + details + '\n\nUser: ' + (order.telegram_username ? '@' + order.telegram_username : order.first_name)
      + '\nTelegram ID: ' + order.telegram_user_id + '\nTime: ' + order.created_at
      : '✓ Order received\n\n' + details + '\n\nWe will contact you with the next update.';
    const buttons = [['Confirm', 'CONFIRMED'], ['Processing', 'PROCESSING'], ['Ready', 'READY'], ['Completed', 'COMPLETED']];
    const reply_markup = admin && this.config.adminIds.length ? { inline_keyboard: [buttons.map(([label, status]) => ({
      text: label, callback_data: order.order_id + ':' + status,
    }))] } : undefined;
    const chunks: string[] = [];
    let chunk = '';
    for (const line of text.split('\n')) {
      if (chunk.length + line.length + 1 > 3900) { chunks.push(chunk); chunk = ''; }
      chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk) chunks.push(chunk);
    for (const [index, part] of chunks.entries()) {
      await this.call('sendMessage', { chat_id: admin ? this.config.env.TELEGRAM_ADMIN_CHAT_ID : order.telegram_user_id,
        text: part, reply_markup: index === chunks.length - 1 ? reply_markup : undefined });
    }
  }
}
