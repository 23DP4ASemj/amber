import type { ApiResult, OrderRequest, OrderConfirmation, Product, PublicConfig } from '../../../../shared/types';
import { telegram } from './telegram';
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
async function request<T>(path: string, body?: unknown): Promise<T> {
  const initData = telegram()?.initData;
  let response: Response;
  try {
    response = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(25000),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(initData ? { Authorization: 'tma ' + initData } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError('NETWORK_ERROR', 'Connection interrupted. Please retry. Your checkout is saved to prevent a duplicate order.', 0); }
  let payload: ApiResult<T>;
  try { payload = await response.json() as ApiResult<T>; }
  catch { throw new ApiError('INVALID_RESPONSE', 'The shop could not be reached. Please try again.', response.status >= 400 ? response.status : 502); }
  if (!payload.success) throw new ApiError(payload.error.code, payload.error.message, response.status);
  if (!response.ok) throw new ApiError('REQUEST_FAILED', 'Please try again shortly.', response.status);
  return payload.data;
}
export const api = {
  config: () => request<PublicConfig>('/config'), products: () => request<Product[]>('/products'),
  order: (body: OrderRequest) => request<OrderConfirmation>('/orders', body),
};
export const money = (value: number, currency = 'EUR') => new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(value);

