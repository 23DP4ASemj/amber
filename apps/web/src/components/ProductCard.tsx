import { Plus, Check, ArrowUpRight } from 'lucide-react';
import type { Product } from '../../../../shared/types';
import { money } from '../lib/api';
export function ProductCard({ product, quantity, onAdd, onOpen }: { product: Product; quantity: number; onAdd: () => void; onOpen: () => void }) {
  const soldOut = product.available <= 0;
  return <article className={'product-card ' + (soldOut ? 'sold-out' : '')}>
    <button className="product-image-button" onClick={onOpen} aria-label={'View ' + product.name + ', ' + product.flavor}>
      <img src={product.image_url || '/products/fallback.svg'} alt={product.name + ' — ' + product.flavor} loading="lazy"
        onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/products/fallback.svg'; }}/>
      <span className={'product-badge ' + (soldOut ? 'muted' : '')}>{soldOut ? 'SOLD OUT' : product.sort_order === 10 ? 'OUR SIGNATURE' : product.available <= 6 ? 'LAST FEW' : product.sort_order === 20 ? 'SLOW MOMENTS' : product.category === 'Everyday objects' ? 'EVERYDAY ESSENTIAL' : 'THE COLLECTION'}</span>
      <span className="product-view"><ArrowUpRight size={19}/></span>
    </button>
    <div className="product-meta"><span>{product.brand}</span><span className={'stock-dot ' + (soldOut ? 'off' : '')}>{soldOut ? 'Unavailable' : product.available + ' in stock'}</span></div>
    <button className="product-name" onClick={onOpen}>{product.name}</button><p className="product-variant">{product.flavor}</p>
    <div className="product-bottom"><strong>{money(product.price)}</strong><button className={'add-button ' + (quantity ? 'in-bag' : '')}
      onClick={onAdd} disabled={soldOut || quantity >= product.available} aria-label={'Add ' + product.name + ', ' + product.flavor + ' to bag'}>
      {quantity ? <><Check size={16}/><span>{quantity} in bag</span></> : <><Plus size={17}/><span>Add to bag</span></>}
    </button></div>
  </article>;
}

