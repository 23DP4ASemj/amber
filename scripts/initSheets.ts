import { readConfig } from '../apps/api/src/config';
import { GoogleSheets, cell } from '../apps/api/src/integrations/googleSheets';
import { productHeaders, orderHeaders, assertHeaders } from '../apps/api/src/repositories/sheetSchema';
import { demoProducts } from '../shared/demoProducts';
const config = readConfig();
if (config.env.DEMO_MODE) throw new Error('Set DEMO_MODE=false and configure your Google credentials first.');
const sheets = new GoogleSheets(config);
const metadata = await sheets.metadata();
const missing = ['Products', 'Orders'].filter(title => !metadata.sheets.some(s => s.properties.title === title));
if (missing.length) await sheets.batch(missing.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })));
const updated = await sheets.metadata();
for (const [title, headers] of [['Products', productHeaders], ['Orders', orderHeaders]] as const) {
  const sheetId = updated.sheets.find(s => s.properties.title === title)!.properties.sheetId;
  const { values = [] } = await sheets.values(title + '!A1:N1');
  if (values.length && values[0].length) { assertHeaders(values[0], headers); continue; }
  await sheets.batch([{ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [{ values: headers.map(cell) }], fields: 'userEnteredValue' } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } }]);
}
if (process.argv.includes('--seed')) {
  const { values = [] } = await sheets.values('Products!A2:M');
  if (values.some(row => row.some(v => v !== ''))) throw new Error('Products is not empty. Seed refused to avoid duplicating or overwriting products.');
  const sheetId = updated.sheets.find(s => s.properties.title === 'Products')!.properties.sheetId;
  await sheets.batch([{ appendCells: { sheetId, rows: demoProducts.map(p => ({ values: [p.id,p.sku,p.category,p.brand,p.name,p.flavor,p.description,p.price,p.available,p.image_url,p.active,p.sort_order,p.blocked_districts.join(',')].map(cell) })), fields: 'userEnteredValue' } }]);
}
console.info('Products and Orders are ready. Existing rows were preserved.');

