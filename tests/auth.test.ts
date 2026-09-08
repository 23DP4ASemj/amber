import { describe, it, expect } from 'vitest';
import { validateTelegramInitData } from '../apps/api/src/utils/validateTelegramInitData';
import { botToken, signedData, testConfig } from './helpers';
describe('Telegram authentication', () => {
  it('validates the signed user, including new signed payload fields', () => {
    expect(validateTelegramInitData(signedData(42, 1000, { signature: 'signed-additional-field', query_id: 'query' }), botToken, 3600, 1100).id).toBe(42);
  });
  it('rejects tampering, malformed hash, duplicate fields and wrong tokens', () => {
    const valid = signedData(42, 1000);
    for (const input of [valid.replace('tester', 'attacker'), valid + '&user=%7B%7D', valid.replace(/hash=[^&]+/, 'hash=ab'), 'bad']) {
      expect(() => validateTelegramInitData(input, botToken, 3600, 1100)).toThrow();
    }
    expect(() => validateTelegramInitData(valid, 'wrong-token', 3600, 1100)).toThrow();
  });
  it('rejects expired and future credentials and malformed users', () => {
    expect(() => validateTelegramInitData(signedData(42, 1000), botToken, 60, 2000)).toThrow();
    expect(() => validateTelegramInitData(signedData(42, 3000), botToken, 3600, 2000)).toThrow();
    expect(() => validateTelegramInitData(signedData(42, 1000, { user: '{"id":-1}' }), botToken, 3600, 1100)).toThrow();
  });
  it('never allows demo mode in production', () => {
    expect(() => testConfig({ NODE_ENV: 'production', DEMO_MODE: 'true' })).toThrow('forbidden');
  });
});

