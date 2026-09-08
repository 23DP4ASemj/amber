import {
  GoogleSheets,
  assertHeaders,
  cell,
  orderHeaders,
  productHeaders
} from "./chunk-AHBO7CRZ.js";
import {
  readConfig
} from "./chunk-2SDIGB7K.js";

// shared/demoProducts.ts
var entries = [
  ["P001", "Home fragrance", "AMBER STUDIO", "The evening candle", "Amber & sandalwood", 24, 12, "candle-amber", "A warm, quietly woody fragrance. Hand-poured soy wax in a reusable amber glass. 180 g \xB7 approximately 35 hours."],
  ["P002", "Tea & botanicals", "SLOW LEAF", "Golden hour tea", "Peach & rooibos", 14, 18, "tea-peach", "Naturally caffeine-free rooibos with peach and calendula. A little sunshine in your cup. 80 g loose-leaf blend."],
  ["P003", "Everyday objects", "FORM & FIELD", "The ritual cup", "Sandstone \xB7 250 ml", 22, 7, "cup-sand", "A tactile stoneware cup with a soft matte glaze. Made for slow mornings. Dishwasher safe."],
  ["P004", "Home fragrance", "AMBER STUDIO", "Forest after rain", "Cedar & moss", 24, 9, "candle-green", "Fresh woodland notes, cedarwood and soft moss. Hand-poured soy wax. 180 g \xB7 approximately 35 hours."],
  ["P005", "Tea & botanicals", "SLOW LEAF", "Midnight garden", "Mint & chamomile", 16, 6, "tea-green", "A delicate herbal infusion for your evening ritual. Chamomile flowers and refreshing peppermint. 80 g."],
  ["P006", "Everyday objects", "FORM & FIELD", "The ritual cup", "Terracotta \xB7 250 ml", 22, 5, "cup-clay", "Warm terracotta stoneware with a comfortable rounded form. Each glaze has its own character. Dishwasher safe."],
  ["P007", "Home fragrance", "AMBER STUDIO", "Sunday morning", "Fig & black tea", 28, 0, "candle-cream", "Green fig, a little black tea and a soft woody base. A slow Sunday, captured in a candle. 220 g."],
  ["P008", "Everyday objects", "FORM & FIELD", "Little things tray", "Olive \xB7 14 cm", 18, 11, "tray", "A sculptural resting place for keys, jewellery and the small things you keep close. Glazed ceramic."]
];
var demoProducts = entries.map(([id, category, brand, name, flavor, price, available, art, description], index) => ({
  id,
  sku: "AS-" + id.slice(1),
  category,
  brand,
  name,
  flavor,
  price,
  available,
  description,
  image_url: "/products/" + art + ".svg",
  active: true,
  sort_order: (index + 1) * 10,
  blocked_districts: []
}));

// scripts/initSheets.ts
var config = readConfig();
if (config.env.DEMO_MODE) throw new Error("Set DEMO_MODE=false and configure your Google credentials first.");
var sheets = new GoogleSheets(config);
var metadata = await sheets.metadata();
var missing = ["Products", "Orders"].filter((title) => !metadata.sheets.some((s) => s.properties.title === title));
if (missing.length) await sheets.batch(missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })));
var updated = await sheets.metadata();
for (const [title, headers] of [["Products", productHeaders], ["Orders", orderHeaders]]) {
  const sheetId = updated.sheets.find((s) => s.properties.title === title).properties.sheetId;
  const { values = [] } = await sheets.values(title + "!A1:N1");
  if (values.length && values[0].length) {
    assertHeaders(values[0], headers);
    continue;
  }
  await sheets.batch([
    { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [{ values: headers.map(cell) }], fields: "userEnteredValue" } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } }
  ]);
}
if (process.argv.includes("--seed")) {
  const { values = [] } = await sheets.values("Products!A2:M");
  if (values.some((row) => row.some((v) => v !== ""))) throw new Error("Products is not empty. Seed refused to avoid duplicating or overwriting products.");
  const sheetId = updated.sheets.find((s) => s.properties.title === "Products").properties.sheetId;
  await sheets.batch([{ appendCells: { sheetId, rows: demoProducts.map((p) => ({ values: [p.id, p.sku, p.category, p.brand, p.name, p.flavor, p.description, p.price, p.available, p.image_url, p.active, p.sort_order, p.blocked_districts.join(",")].map(cell) })), fields: "userEnteredValue" } }]);
}
console.info("Products and Orders are ready. Existing rows were preserved.");
