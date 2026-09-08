import 'dotenv/config';
import { z } from 'zod';
import type { PublicConfig } from '../../../../shared/types';
const bool = (fallback: boolean) => z.enum(['true', 'false']).default(String(fallback) as 'true' | 'false').transform(v => v === 'true');
const csv = (value: string) => value.split(',').map(s => s.trim()).filter(Boolean);
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DEMO_MODE: bool(false), WEBAPP_URL: z.url().default('http://localhost:5173'),
  TELEGRAM_BOT_TOKEN: z.string().default(''), TELEGRAM_ADMIN_CHAT_ID: z.string().default(''),
  TELEGRAM_ADMIN_USER_IDS: z.string().default(''), TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  GOOGLE_SHEET_ID: z.string().default(''), GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().default(''),
  GOOGLE_PRIVATE_KEY: z.string().default(''), INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  SHOP_NAME: z.string().min(1).default('Amber & Smoke'), DISTRICTS: z.string().default('Centrs,Zolitūde,Imanta,Salaspils'),
  BLOCKED_DISTRICTS: z.string().default(''), DISABLED_CATEGORIES: z.string().default(''), HIDE_SOLD_OUT: bool(false),
  MINIMUM_AGE: z.coerce.number().int().min(18).max(100).default(18),
  LEGAL_NOTICE: z.string().default('For adults only. Availability and delivery depend on your district.'),
  AGE_VERIFICATION_MODE: z.enum(['declaration', 'external']).default('declaration'),
  AGE_VERIFICATION_URL: z.string().default(''), AGE_VERIFICATION_API_KEY: z.string().default(''),
  DATA_DIR: z.string().default('./data'), TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});
export function readConfig(input: NodeJS.ProcessEnv = process.env) {
  const env = schema.parse(input);
  if (env.NODE_ENV === 'production' && env.DEMO_MODE) throw new Error('DEMO_MODE is forbidden in production');
  if (!env.DEMO_MODE) {
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_CHAT_ID', 'GOOGLE_SHEET_ID',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'TELEGRAM_WEBHOOK_SECRET'] as const) {
      if (!env[key]) throw new Error('Missing environment variable: ' + key);
    }
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET)) throw new Error('Webhook secret must be 32–256 URL-safe characters');
    if (!/^-?\d+$/.test(env.TELEGRAM_ADMIN_CHAT_ID)) throw new Error('Admin chat ID must be numeric');
  }
  if (env.NODE_ENV === 'production' && !env.WEBAPP_URL.startsWith('https://')) throw new Error('HTTPS WEBAPP_URL required');
  if (env.AGE_VERIFICATION_MODE === 'external' && (!env.AGE_VERIFICATION_URL.startsWith('https://') || !env.AGE_VERIFICATION_API_KEY)) {
    throw new Error('External verification needs an HTTPS URL and API key');
  }
  const districts = csv(env.DISTRICTS);
  if (!districts.length || new Set(districts).size !== districts.length) throw new Error('DISTRICTS must be unique and nonempty');
  const adminIds = csv(env.TELEGRAM_ADMIN_USER_IDS).map(Number);
  if (adminIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid admin user IDs');
  const publicConfig: PublicConfig = {
    shopName: env.SHOP_NAME, districts, currency: 'EUR', hideSoldOut: env.HIDE_SOLD_OUT, demoMode: env.DEMO_MODE,
    compliance: { minimumAge: env.MINIMUM_AGE, legalNotice: env.LEGAL_NOTICE, disabledCategories: csv(env.DISABLED_CATEGORIES),
      blockedDistricts: csv(env.BLOCKED_DISTRICTS), ageVerificationMode: env.AGE_VERIFICATION_MODE },
  };
  return { env, publicConfig, adminIds };
}
export type Config = ReturnType<typeof readConfig>;

