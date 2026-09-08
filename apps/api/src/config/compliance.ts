import type { Product, OrderRequest, TelegramUser } from '../../../../shared/types';
import type { Config } from './index';
import { AppError } from '../utils/errors';
export function isVisible(product: Product, config: Config, district?: string) {
  return product.active && !config.publicConfig.compliance.disabledCategories.includes(product.category)
    && (!config.publicConfig.hideSoldOut || product.available > 0)
    && (!district || !product.blocked_districts.includes(district));
}
export interface AgeVerifier { verify(user: TelegramUser, request: OrderRequest): Promise<void> }
export function createAgeVerifier(config: Config): AgeVerifier {
  return { async verify(user, request) {
    if (!request.age_confirmed) throw new AppError(403, 'AGE_REQUIRED', 'Please confirm your age.');
    if (config.env.AGE_VERIFICATION_MODE === 'declaration') return;
    if (!request.age_verification_token) throw new AppError(403, 'AGE_VERIFICATION_REQUIRED', 'A verified age token is required.');
    let response: Response;
    try {
      response = await fetch(config.env.AGE_VERIFICATION_URL, { method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.env.AGE_VERIFICATION_API_KEY },
        body: JSON.stringify({ user_id: user.id, minimum_age: config.env.MINIMUM_AGE, token: request.age_verification_token }) });
      const result: unknown = await response.json();
      if (response.ok && typeof result === 'object' && result !== null && 'verified' in result && result.verified === true
        && 'user_id' in result && result.user_id === user.id) return;
    } catch { throw new AppError(503, 'VERIFICATION_UNAVAILABLE', 'Age verification is temporarily unavailable.'); }
    throw new AppError(403, 'AGE_VERIFICATION_FAILED', 'We could not verify your age.');
  } };
}

