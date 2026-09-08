import { GoogleAuth } from 'google-auth-library';
import type { Config } from '../config';
import { AppError } from '../utils/errors';
export interface SheetMetadata { sheets: { properties: { sheetId: number; title: string } }[] }
export interface ValueRange { values?: unknown[][] }
export class GoogleSheets {
  private auth: GoogleAuth;
  private base: string;
  constructor(config: Config) {
    this.auth = new GoogleAuth({ credentials: { client_email: config.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: config.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    this.base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(config.env.GOOGLE_SHEET_ID);
  }
  async request<T>(path: string, body?: unknown): Promise<T> {
    try {
      const token = await this.auth.getAccessToken();
      const response = await fetch(this.base + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error('Google Sheets request failed');
      return await response.json() as T;
    } catch { throw new AppError(503, 'SHEETS_UNAVAILABLE', 'The shop is temporarily unavailable. Please try again shortly.'); }
  }
  metadata() { return this.request<SheetMetadata>('?fields=sheets.properties(sheetId,title)'); }
  values(range: string) { return this.request<ValueRange>('/values/' + encodeURIComponent(range) + '?valueRenderOption=UNFORMATTED_VALUE'); }
  batch(requests: unknown[]) { return this.request<unknown>(':batchUpdate', { requests }); }
}
export function cell(value: string | number | boolean) {
  return { userEnteredValue: typeof value === 'number' ? { numberValue: value } : typeof value === 'boolean' ? { boolValue: value } : { stringValue: value } };
}

