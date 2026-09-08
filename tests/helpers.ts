import { createHmac, randomUUID } from 'node:crypto';
import { readConfig } from '../apps/api/src/config';
import { MemoryStore } from '../apps/api/src/repositories/memoryStore';
import { createApp } from '../apps/api/src/app';
import { Telegram } from '../apps/api/src/integrations/telegram';
import { demoProducts } from '../shared/demoProducts';
export const botToken = '123456:TEST_TOKEN_NOT_REAL';
export function signedData(id = 42, timestamp = Math.floor(Date.now() / 1000), extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ auth_date: String(timestamp), user: JSON.stringify({ id, first_name: 'Test', username: 'tester' }), ...extra });
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => key + '=' + value).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
export function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return readConfig({ NODE_ENV: 'test', DEMO_MODE: 'false', TELEGRAM_BOT_TOKEN: botToken,
    TELEGRAM_ADMIN_CHAT_ID: '-100123', TELEGRAM_ADMIN_USER_IDS: '999', TELEGRAM_WEBHOOK_SECRET: 'test_secret_123456789012345678901234567890',
    GOOGLE_SHEET_ID: 'sheet-test', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: 'not-a-key',
    WEBAPP_URL: 'https://shop.example.com', ...overrides });
}
export class FakeTelegram extends Telegram {
  sent: { method: string; body: Record<string, unknown> }[] = [];
  fail = false;
  override async call(method: string, body: Record<string, unknown>) {
    if (this.fail) throw new Error('Test Telegram outage');
    this.sent.push({ method, body });
  }
}
export function fixture(overrides: NodeJS.ProcessEnv = {}) {
  const config = testConfig(overrides);
  const store = new MemoryStore(demoProducts);
  const telegram = new FakeTelegram(config);
  return { ...createApp(config, store, telegram), store, telegram, config };
}
export function orderBody(productId = 'P001', qty = 1) {
  return { client_order_id: randomUUID(), district: 'Centrs', items: [{ product_id: productId, qty }], age_confirmed: true as const };
}

