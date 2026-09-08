import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppError } from '../utils/errors';
export class WriteJournal {
  readonly path: string;
  constructor(private directory: string) { this.path = resolve(directory, 'pending-write.json'); }
  async pending(): Promise<unknown | null> {
    try { return JSON.parse(await readFile(this.path, 'utf8')) as unknown; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async assertClear() {
    if (await this.pending() !== null) throw new AppError(503, 'RECONCILIATION_REQUIRED', 'Checkout is paused while an earlier operation is verified. Please keep your checkout and retry later.');
  }
  async begin(operation: unknown) {
    await mkdir(this.directory, { recursive: true });
    const file = await open(this.path, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ at: new Date().toISOString(), operation })); await file.sync(); }
    finally { await file.close(); }
  }
  async clear() { await unlink(this.path); }
}

