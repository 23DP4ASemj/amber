import { readConfig } from './config';
import { createApp } from './app';
import { MemoryStore } from './repositories/memoryStore';
import { SheetsStore } from './repositories/sheetsStore';
import { GoogleSheets } from './integrations/googleSheets';
import { WriteJournal } from './repositories/writeJournal';
import { demoProducts } from '../../../shared/demoProducts';
const config = readConfig();
const store = config.env.DEMO_MODE ? new MemoryStore(demoProducts) : new SheetsStore(new GoogleSheets(config), new WriteJournal(config.env.DATA_DIR));
const { app, notifications, orders } = createApp(config, store);
const server = app.listen(config.env.PORT, config.env.DEMO_MODE ? '127.0.0.1' : '0.0.0.0', () => {
  console.info(JSON.stringify({ event: 'server_started', port: config.env.PORT, demo: config.env.DEMO_MODE }));
});
const worker = setInterval(() => { void notifications.drain(); }, 30000);
worker.unref();
void notifications.drain();
function shutdown() {
  clearInterval(worker);
  server.close(() => { void orders.mutex.run(async () => {}).then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 20000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

