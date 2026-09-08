import type { Product } from './types';
const entries = [
  ['P001', 'Home fragrance', 'AMBER STUDIO', 'The evening candle', 'Amber & sandalwood', 24, 12, 'candle-amber', 'A warm, quietly woody fragrance. Hand-poured soy wax in a reusable amber glass. 180 g · approximately 35 hours.'],
  ['P002', 'Tea & botanicals', 'SLOW LEAF', 'Golden hour tea', 'Peach & rooibos', 14, 18, 'tea-peach', 'Naturally caffeine-free rooibos with peach and calendula. A little sunshine in your cup. 80 g loose-leaf blend.'],
  ['P003', 'Everyday objects', 'FORM & FIELD', 'The ritual cup', 'Sandstone · 250 ml', 22, 7, 'cup-sand', 'A tactile stoneware cup with a soft matte glaze. Made for slow mornings. Dishwasher safe.'],
  ['P004', 'Home fragrance', 'AMBER STUDIO', 'Forest after rain', 'Cedar & moss', 24, 9, 'candle-green', 'Fresh woodland notes, cedarwood and soft moss. Hand-poured soy wax. 180 g · approximately 35 hours.'],
  ['P005', 'Tea & botanicals', 'SLOW LEAF', 'Midnight garden', 'Mint & chamomile', 16, 6, 'tea-green', 'A delicate herbal infusion for your evening ritual. Chamomile flowers and refreshing peppermint. 80 g.'],
  ['P006', 'Everyday objects', 'FORM & FIELD', 'The ritual cup', 'Terracotta · 250 ml', 22, 5, 'cup-clay', 'Warm terracotta stoneware with a comfortable rounded form. Each glaze has its own character. Dishwasher safe.'],
  ['P007', 'Home fragrance', 'AMBER STUDIO', 'Sunday morning', 'Fig & black tea', 28, 0, 'candle-cream', 'Green fig, a little black tea and a soft woody base. A slow Sunday, captured in a candle. 220 g.'],
  ['P008', 'Everyday objects', 'FORM & FIELD', 'Little things tray', 'Olive · 14 cm', 18, 11, 'tray', 'A sculptural resting place for keys, jewellery and the small things you keep close. Glazed ceramic.'],
] as const;
export const demoProducts: Product[] = entries.map(([id, category, brand, name, flavor, price, available, art, description], index) => ({
  id, sku: 'AS-' + id.slice(1), category, brand, name, flavor, price, available, description,
  image_url: '/products/' + art + '.svg', active: true, sort_order: (index + 1) * 10, blocked_districts: [],
}));

