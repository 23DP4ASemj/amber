import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, MapPin, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Send } from 'lucide-react';
import type { OrderRequest, OrderConfirmation, Product, PublicConfig } from '../../../../shared/types';
import { orderRequestSchema } from '../../../../shared/schemas';
import type { Cart } from '../hooks/useCart';
import { api, ApiError, money } from '../lib/api';
import { readStorage, writeStorage, removeStorage } from '../lib/storage';
import { telegram } from '../lib/telegram';
import { Modal } from './Modal';
const pendingKey = 'as:pending-checkout';
function getPending() {
  const parsed = orderRequestSchema.safeParse(readStorage<unknown>(pendingKey, null, true));
  return parsed.success ? parsed.data : null;
}
export function CartSheet({ cart, config, products, district, onDistrict, onClose, onRefresh, onPendingChange }: {
  cart: Cart; config: PublicConfig; products: Product[]; district: string; onDistrict: (v: string) => void; onClose: () => void; onRefresh: () => Promise<void>; onPendingChange: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState<OrderRequest | null>(getPending);
  useEffect(() => { onPendingChange(Boolean(pending)); }, [pending, onPendingChange]);
  const [step, setStep] = useState<'cart' | 'checkout'>(() => getPending() ? 'checkout' : 'cart');
  const [confirmed, setConfirmed] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [result, setResult] = useState<OrderConfirmation | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const shownItems = pending?.items ?? cart.items;
  const selectedDistrict = pending?.district ?? district;
  const user = telegram()?.initDataUnsafe.user;
  const canOrder = config.demoMode || Boolean(telegram()?.initData);
  const invalidItems = shownItems.some(i => {
    const p = products.find(p => p.id === i.product_id);
    return !p || i.qty > p.available || p.blocked_districts.includes(selectedDistrict);
  });
  const districtBlocked = config.compliance.blockedDistricts.includes(selectedDistrict);
  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true); setError('');
    const body: OrderRequest = pending ?? { client_order_id: crypto.randomUUID(), district, items: cart.items, age_confirmed: true,
      ...(verificationToken ? { age_verification_token: verificationToken } : {}) };
    setPending(body); writeStorage(pendingKey, body, true);
    try {
      const order = await api.order(body);
      setResult(order); cart.clear(); setPending(null); removeStorage(pendingKey, true);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not place your order.');
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.code !== 'IDEMPOTENCY_CONFLICT') {
        setPending(null); removeStorage(pendingKey, true);
        if (['OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE'].includes(err.code)) { setStep('cart'); await onRefresh(); }
      }
    } finally { setSubmitting(false); submittingRef.current = false; }
  };
  if (result) return <Modal title="A little good is on its way" onClose={onClose}><div className="success-content">
    <span className="success-icon"><CheckCheck size={38}/></span><span className="eyebrow">{config.demoMode ? 'DEMO ORDER RECEIVED' : 'THANK YOU FOR YOUR ORDER'}</span>
    <h3>Good choice.<br/><em>Great little ritual.</em></h3><p>{config.demoMode ? 'This is a sample order. No delivery or Telegram messages will be sent.' : 'Your order is saved. We will send the details and next steps to your Telegram.'}</p>
    <div className="receipt"><div><span>Order number</span><strong>{result.order_id}</strong></div><div><span>Delivery district</span><strong>{result.district}</strong></div>
      <div><span>Total</span><strong>{money(result.total)}</strong></div></div><button className="primary" onClick={onClose}>Back to the collection <ArrowRight size={18}/></button>
    </div></Modal>;
  return <Modal title={step === 'cart' ? 'Your bag' : 'The final little details'} onClose={() => { if (!submittingRef.current) onClose(); }}>
    {!shownItems.length ? <div className="empty-state"><ShoppingBag size={40}/><h3>A little room for something good.</h3><p>Find your next everyday favourite in our collection.</p><button className="primary" onClick={onClose}>Explore the collection <ArrowRight size={18}/></button></div> :
      <div className="cart-content">
        {step === 'checkout' && !pending && <button className="back-link" onClick={() => setStep('cart')}><ArrowLeft size={16}/> Back to your bag</button>}
        {pending && <div className="notice">Your checkout is saved. Retrying checks the same order, so it will not create a second one.</div>}
        <div className="cart-items">{shownItems.map(item => {
          const product = products.find(p => p.id === item.product_id);
          return <div className="cart-item" key={item.product_id}><img src={product?.image_url || '/products/fallback.svg'} alt="" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/products/fallback.svg'; }}/>
            <div className="cart-item-main"><h3>{product?.name ?? 'Unavailable item'}</h3><p>{product?.flavor ?? item.product_id}</p>
              {step === 'cart' ? <div className="quantity-control"><button onClick={() => cart.setQuantity(item.product_id, item.qty - 1)} aria-label={'Decrease ' + product?.name}><Minus size={14}/></button><span>{item.qty}</span>
                <button onClick={() => cart.setQuantity(item.product_id, item.qty + 1)} disabled={!product || item.qty >= product.available} aria-label={'Increase ' + product?.name}><Plus size={14}/></button></div>
                : <span className="item-quantity">Quantity: {item.qty}</span>}
              {(!product || item.qty > product.available || product.blocked_districts.includes(selectedDistrict)) && <span className="item-error">Please remove this item or reduce its quantity.</span>}
            </div><div className="cart-item-end"><strong>{product ? money(product.price * item.qty) : '—'}</strong>
              {step === 'cart' && <button className="icon-button" onClick={() => cart.setQuantity(item.product_id, 0)} aria-label={'Remove ' + product?.name}><Trash2 size={17}/></button>}</div></div>;
        })}</div>
        {step === 'checkout' && <section className="checkout-fields"><label className="field-label"><MapPin size={16}/> Your delivery district</label>
          <div className="district-options">{config.districts.map(d => <button key={d} disabled={Boolean(pending) || config.compliance.blockedDistricts.includes(d)}
            className={'option ' + (selectedDistrict === d ? 'selected' : '')} onClick={() => onDistrict(d)}>{d}{selectedDistrict === d && <Check size={14}/>}</button>)}</div>
          <div className="telegram-account"><Send size={19}/><div><strong>{user ? user.username ? '@' + user.username : user.first_name : config.demoMode ? 'Demo visitor' : 'Open this shop in Telegram'}</strong>
            <span>{user ? 'Order updates will arrive in this Telegram account' : config.demoMode ? 'Sample orders only · no messages are sent' : 'Telegram authentication is required to place an order'}</span></div></div>
          {!pending && <><label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>I confirm that I am {config.compliance.minimumAge} or older and have reviewed my order and delivery district.</span></label>
            {config.compliance.ageVerificationMode === 'external' && <label className="field-label">Age verification code<input className="text-input" value={verificationToken} onChange={e => setVerificationToken(e.target.value)} autoComplete="off" placeholder="Code from your age verification service"/><small>Use the code issued after verifying your age with the shop's verification service.</small></label>}</>}
          <p className="fine-print">{config.compliance.legalNotice}</p></section>}
        {error && <div className="error-message" role="alert">{error}</div>}
        {districtBlocked && <div className="error-message">Checkout is unavailable in this district. Choose another district.</div>}
        <div className="cart-summary"><div><span>Subtotal</span><span>{money(cart.total)}</span></div><div><span>Delivery</span><span>Included</span></div><div className="summary-total"><span>Total</span><strong>{money(cart.total)}</strong></div></div>
        {step === 'cart' ? <button className="primary" disabled={invalidItems} onClick={() => { setStep('checkout'); setError(''); }}>Continue to checkout <ArrowRight size={19}/></button>
          : <button className="primary" disabled={submitting || !canOrder || (!pending && (!confirmed || invalidItems || districtBlocked || (config.compliance.ageVerificationMode === 'external' && !verificationToken)))}
            onClick={() => { void submit(); }}>{submitting ? 'Placing your order…' : pending ? 'Retry this checkout' : config.demoMode ? 'Place demo order' : 'Place order'}<ArrowRight size={19}/></button>}
        <p className="secure-note"><ShieldCheck size={14}/>{step === 'cart' ? 'A few taps away from your next favourite' : 'Pay on delivery · no payment is collected here'}</p>
      </div>}
  </Modal>;
}
