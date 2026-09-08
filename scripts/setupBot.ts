import { readConfig } from '../apps/api/src/config';
import { Telegram } from '../apps/api/src/integrations/telegram';
const config = readConfig();
if (config.env.DEMO_MODE) throw new Error('Set DEMO_MODE=false and configure your credentials first.');
const origin = process.argv.find(arg => arg.startsWith('--api-url='))?.slice('--api-url='.length) ?? config.env.WEBAPP_URL;
if (!origin.startsWith('https://') || !config.env.WEBAPP_URL.startsWith('https://')) throw new Error('Bot setup requires public HTTPS frontend and backend URLs.');
const telegram = new Telegram(config);
await telegram.call('setMyCommands', { commands: [{ command: 'start', description: 'Open the shop' }] });
await telegram.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open Shop', web_app: { url: config.env.WEBAPP_URL } } });
await telegram.call('setWebhook', { url: new URL('/api/telegram/webhook', origin).toString(), secret_token: config.env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
console.info('Bot commands, menu and webhook configured.');

