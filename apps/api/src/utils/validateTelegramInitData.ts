import { createHmac, timingSafeEqual } from 'node:crypto';
import { telegramUserSchema } from '../../../../shared/schemas';
import { AppError } from './errors';
export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 3600, now = Math.floor(Date.now() / 1000)) {
  const invalid = () => new AppError(401, 'INVALID_INIT_DATA', 'Open the shop again from Telegram to refresh your session.');
  if (!botToken || !initData || initData.length > 16384) throw invalid();
  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (keys.length !== new Set(keys).size) throw invalid();
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw invalid();
  params.delete('hash');
  const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => k + '=' + v).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw invalid();
  const date = params.get('auth_date') ?? '';
  const timestamp = Number(date);
  if (!/^\d+$/.test(date) || !Number.isSafeInteger(timestamp) || timestamp > now + 30 || now - timestamp > maxAgeSeconds) throw invalid();
  try { return telegramUserSchema.parse(JSON.parse(params.get('user') ?? 'null')); }
  catch { throw invalid(); }
}

