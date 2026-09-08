export function readStorage<T>(key: string, fallback: T, session = false): T {
  try { return JSON.parse((session ? sessionStorage : localStorage).getItem(key) ?? 'null') as T ?? fallback; }
  catch { return fallback; }
}
export function writeStorage(key: string, value: unknown, session = false) {
  try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable in a WebView. In-memory state still works. */ }
}
export function removeStorage(key: string, session = false) {
  try { (session ? sessionStorage : localStorage).removeItem(key); } catch { /* Storage is optional. */ }
}

