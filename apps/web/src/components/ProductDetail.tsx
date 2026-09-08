import { useState } from 'react';
import { Plus, PackageCheck } from 'lucide-react';
import type { Product } from '../../../../shared/types';
import type { Cart } from '../hooks/useCart';
import { money } from '../lib/api';
import { Modal } from './Modal';
export function ProductDetail({ product, products, cart, onClose }: { product: Product; products: Product[]; cart: Cart; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(product.id);
  const selected = products.find(p => p.id === selectedId) ?? product;
  const variants = products.filter(p => p.brand === product.brand && p.name === product.name);
  const quantity = cart.items.find(i => i.product_id === selected.id)?.qty ?? 0;
  return <Modal title="A closer look" onClose={onClose}><img className="detail-image" src={selected.image_url || '/products/fallback.svg'} alt={selected.name}
      onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/products/fallback.svg'; }}/>
    <div className="detail-body"><span className="eyebrow">{selected.brand}</span><h3>{selected.name}</h3><p>{selected.description}</p>
      <label className="field-label">Choose your variant</label><div className="variant-options">{variants.map(p => <button key={p.id} className={'option ' + (selectedId === p.id ? 'selected' : '')} onClick={() => setSelectedId(p.id)}>{p.flavor}</button>)}</div>
      <p className="stock-info"><PackageCheck size={16}/>{selected.available ? selected.available + ' available' : 'Currently sold out'}</p>
      <button className="primary" disabled={quantity >= selected.available} onClick={() => cart.add(selected)}>
        {selected.available ? quantity ? quantity + ' in bag · Add another' : 'Add to bag' : 'Sold out'} <span>{money(selected.price)} <Plus size={18}/></span>
      </button></div></Modal>;
}

