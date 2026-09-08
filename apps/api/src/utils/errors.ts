export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function logFailure(event: string, error: unknown, orderId?: string) {
  // Do not log SDK errors: they can contain authorization headers, tokens and customer data.
  console.error(JSON.stringify({ event, orderId, kind: error instanceof AppError ? error.code : 'UPSTREAM_ERROR', at: new Date().toISOString() }));
}

