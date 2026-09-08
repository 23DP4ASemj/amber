import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { fixture, orderBody } from './helpers';
describe('Notifications and administrator actions', () => {
  it('splits long order notifications within Telegram message limits', async () => {
    const f = fixture();
    const { order } = await f.orders.processOrderAtomically(orderBody(), { id: 42, first_name: 'Test' });
    order.items = Array.from({ length: 40 }, (_, index) => ({ ...order.items[0], product_id: 'P' + index, name: 'A'.repeat(160), flavor: 'B'.repeat(120) }));
    await f.telegram.notify(order, 'admin');
    expect(f.telegram.sent.length).toBeGreaterThan(1);
    expect(f.telegram.sent.every(s => String(s.body.text).length <= 3900)).toBe(true);
    expect(f.telegram.sent.at(-1)?.body.reply_markup).toBeDefined();
    expect(f.telegram.sent[0].body.reply_markup).toBeUndefined();
  });
  it('retains the order during notification failure and retries delivery independently', async () => {
    const f = fixture(); const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await f.orders.processOrderAtomically(orderBody(), { id: 42, first_name: 'Test' });
    f.telegram.fail = true; await f.notifications.drain();
    expect(f.store.orders).toHaveLength(1); expect(f.store.orders[0].customer_notified).toBe(false);
    f.telegram.fail = false; await f.notifications.drain();
    expect(f.store.orders[0].customer_notified).toBe(true); expect(f.store.orders[0].admin_notified).toBe(true);
    expect(f.telegram.sent).toHaveLength(2);
    await f.notifications.drain(); expect(f.telegram.sent).toHaveLength(2); log.mockRestore();
  });
  it('protects the webhook and checks both admin user and chat', async () => {
    const f = fixture();
    const { order } = await f.orders.processOrderAtomically(orderBody(), { id: 42, first_name: 'Test' });
    const update = { update_id: 1, callback_query: { id: 'cb', data: order.order_id + ':CONFIRMED', from: { id: 888 }, message: { chat: { id: -100123 } } } };
    expect((await request(f.app).post('/api/telegram/webhook').send(update)).status).toBe(401);
    await request(f.app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', f.config.env.TELEGRAM_WEBHOOK_SECRET).send(update);
    expect(f.store.orders[0].status).toBe('NEW');
    update.callback_query.from.id = 999;
    await request(f.app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', f.config.env.TELEGRAM_WEBHOOK_SECRET).send(update);
    expect(f.store.orders[0].status).toBe('CONFIRMED');
    await f.orders.changeStatus(order.order_id, 'CONFIRMED');
    await expect(f.orders.changeStatus(order.order_id, 'COMPLETED')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
  });
  it('provides the Mini App launch button for /start', async () => {
    const f = fixture();
    await request(f.app).post('/api/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', f.config.env.TELEGRAM_WEBHOOK_SECRET)
      .send({ update_id: 7, message: { chat: { id: 42, type: 'private' }, text: '/start' } });
    expect(f.telegram.sent[0].body.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Open Shop', web_app: { url: f.config.env.WEBAPP_URL } }]] });
  });
});
