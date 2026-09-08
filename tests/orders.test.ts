import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { fixture, orderBody, signedData } from './helpers';
import { AppError } from '../apps/api/src/utils/errors';
const user = { id: 42, first_name: 'Test', username: 'tester' };
describe('Order flow', () => {
  it('requires signed identity and rejects client prices and duplicate product IDs', async () => {
    const { app } = fixture();
    expect((await request(app).post('/api/orders').send(orderBody())).status).toBe(401);
    expect((await request(app).post('/api/orders').set('Authorization', 'tma ' + signedData()).send({ ...orderBody(), total: 1 })).status).toBe(400);
    const body = orderBody(); body.items.push(body.items[0]);
    expect((await request(app).post('/api/orders').set('Authorization', 'tma ' + signedData()).send(body)).status).toBe(400);
  });
  it('persists one order and decrements once when a POST is repeated', async () => {
    const { app, store } = fixture();
    const body = orderBody('P001', 2);
    const first = await request(app).post('/api/orders').set('Authorization', 'tma ' + signedData()).send(body);
    const repeated = await request(app).post('/api/orders').set('Authorization', 'tma ' + signedData()).send(body);
    expect(first.status).toBe(201); expect(repeated.status).toBe(200);
    expect(first.body.data.total).toBe(48); expect(repeated.body.data.order_id).toBe(first.body.data.order_id);
    expect(store.orders).toHaveLength(1); expect(store.products[0].available).toBe(10);
    expect(first.body.data.telegram_user_id).toBeUndefined();
  });
  it('serializes competing orders for the last item', async () => {
    const { orders, store } = fixture();
    store.products[0].available = 1;
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => orders.processOrderAtomically(orderBody(), user)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(store.orders).toHaveLength(1); expect(store.products[0].available).toBe(0);
  });
  it('serializes concurrent requests with the same key', async () => {
    const { orders, store } = fixture(); const body = orderBody();
    const results = await Promise.all(Array.from({ length: 12 }, () => orders.processOrderAtomically(body, user)));
    expect(new Set(results.map(r => r.order.order_id)).size).toBe(1);
    expect(store.products[0].available).toBe(11);
  });
  it('rejects another user or payload reusing the key', async () => {
    const { orders } = fixture(); const body = orderBody();
    await orders.processOrderAtomically(body, user);
    await expect(orders.processOrderAtomically({ ...body, district: 'Imanta' }, user)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(orders.processOrderAtomically(body, { ...user, id: 43 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('does not partially save an order when persistence fails', async () => {
    const { orders, store } = fixture();
    vi.spyOn(store, 'commitOrder').mockRejectedValueOnce(new AppError(503, 'SHEETS_UNAVAILABLE', 'offline'));
    await expect(orders.processOrderAtomically(orderBody(), user)).rejects.toThrow();
    expect(store.orders).toHaveLength(0); expect(store.products[0].available).toBe(12);
    await orders.processOrderAtomically(orderBody(), user);
    expect(store.orders).toHaveLength(1);
  });
  it('enforces current stock, active flags, category and district restrictions', async () => {
    const { orders, store } = fixture({ DISABLED_CATEGORIES: 'Tea & botanicals', BLOCKED_DISTRICTS: 'Salaspils' });
    await expect(orders.processOrderAtomically(orderBody('P002'), user)).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    await expect(orders.processOrderAtomically({ ...orderBody(), district: 'Salaspils' }, user)).rejects.toMatchObject({ code: 'REGION_RESTRICTED' });
    await expect(orders.processOrderAtomically({ ...orderBody(), district: 'Unknown' }, user)).rejects.toMatchObject({ code: 'INVALID_DISTRICT' });
    store.products[0].available = 0;
    await expect(orders.processOrderAtomically(orderBody(), user)).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    store.products[0].active = false;
    await expect(orders.processOrderAtomically(orderBody(), user)).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    store.products[2].blocked_districts = ['Centrs'];
    await expect(orders.processOrderAtomically(orderBody('P003'), user)).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    expect(store.orders).toHaveLength(0);
  });
  it('uses integer cents for exact totals', async () => {
    const { store, orders } = fixture(); store.products[0].price = 19.99;
    expect((await orders.processOrderAtomically(orderBody('P001', 3), user)).order.total).toBe(59.97);
  });
  it('returns only active and permitted products and hides sold out when configured', async () => {
    const { app, store } = fixture({ HIDE_SOLD_OUT: 'true', DISABLED_CATEGORIES: 'Tea & botanicals' });
    store.products[0].active = false;
    const result = await request(app).get('/api/products');
    expect(result.status).toBe(200);
    expect(result.body.data.some((p: { id: string }) => ['P001', 'P002', 'P005', 'P007'].includes(p.id))).toBe(false);
  });
  it('requires age declaration and external verification when enabled', async () => {
    const { app } = fixture();
    expect((await request(app).post('/api/orders').set('Authorization', 'tma ' + signedData()).send({ ...orderBody(), age_confirmed: false })).status).toBe(400);
    const external = fixture({ AGE_VERIFICATION_MODE: 'external', AGE_VERIFICATION_URL: 'https://verify.example.com', AGE_VERIFICATION_API_KEY: 'test' });
    await expect(external.orders.processOrderAtomically(orderBody(), user)).rejects.toMatchObject({ code: 'AGE_VERIFICATION_REQUIRED' });
  });
});

