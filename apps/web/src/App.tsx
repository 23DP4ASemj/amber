import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Flame, Leaf, MapPin, PackageCheck, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Truck, X } from 'lucide-react';
import type { Product, PublicConfig } from '../../../shared/types';
import { api, money } from './lib/api';
import { readStorage, writeStorage } from './lib/storage';
import { useCart } from './hooks/useCart';
import { AgeGate } from './components/AgeGate';
import { ProductCard } from './components/ProductCard';
import { ProductDetail } from './components/ProductDetail';
import { CartSheet } from './components/CartSheet';
import { Modal } from './components/Modal';
export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [acceptedAge, setAcceptedAge] = useState(() => readStorage<number>('as:age', 0, true));
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All products');
  const [sort, setSort] = useState('featured');
  const [stockOnly, setStockOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [district, setDistrict] = useState(''); 
  const [sheet, setSheet] = useState<'cart' | 'district' | 'help' | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [toast, setToast] = useState('');
  const [checkoutLocked, setCheckoutLocked] = useState(() => Boolean(readStorage('as:pending-checkout', null, true)));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const catalogRef = useRef<HTMLElement>(null);
  const cart = useCart(products);
  const ageAccepted = Boolean(config && acceptedAge >= config.compliance.minimumAge);
  const loadConfig = async () => {
    setError('');
    try { const data = await api.config(); setConfig(data); setDistrict(data.districts[0] ?? ''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the shop.'); }
  };
  const loadProducts = async () => {
    setLoading(true); setError('');
    try { setProducts(await api.products()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the collection.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadConfig(); }, []);
  useEffect(() => { if (ageAccepted) void loadProducts(); }, [ageAccepted]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const add = (product: Product) => {
    if (checkoutLocked) { setSheet('cart'); return; }
    cart.add(product); setToast(product.name + ' added to your bag');
    clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400);
  };
  if (!config) return <main className="startup"><span className="brand-symbol"><Leaf size={26}/></span><h1>Amber & Smoke</h1>{error ? <><p role="alert">{error}</p><button className="primary" onClick={() => { void loadConfig(); }}>Try again</button></> : <p className="loading-pulse">A little good is loading…</p>}</main>;
  if (!ageAccepted) return <AgeGate config={config} onAccept={() => { setAcceptedAge(config.compliance.minimumAge); writeStorage('as:age', config.compliance.minimumAge, true); }}/>;
  const regionalProducts = products.filter(p => !p.blocked_districts.includes(district));
  const categories = ['All products', ...new Set(regionalProducts.map(p => p.category))];
  const filtered = regionalProducts.filter(p => (category === 'All products' || p.category === category) && (!stockOnly || p.available > 0)
    && [p.name, p.brand, p.flavor, p.category].join(' ').toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) => sort === 'price-low' ? a.price - b.price : sort === 'price-high' ? b.price - a.price : a.sort_order - b.sort_order);
  const scrollCatalog = () => catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="app">
    <div className="announcement"><span>A little slower. A little better.</span><span><span className="live-dot"/> Thoughtfully selected in Riga</span></div>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span className="brand-symbol"><Leaf size={22}/></span><span>{config.shopName}<small>THE EVERYDAY COLLECTION</small></span></button>
      <nav className="desktop-nav" aria-label="Main navigation"><button className="active" onClick={scrollCatalog}>The collection</button><button onClick={() => setSheet('help')}>How it works <ArrowUpRight size={13}/></button></nav>
      <div className="header-actions"><button className="location-button" onClick={() => setSheet('district')}><MapPin size={17}/><span>{district}</span><ChevronDown size={13}/></button>
        <button className="header-bag" onClick={() => setSheet('cart')} aria-label={'Open bag, ' + cart.count + ' items'}><ShoppingBag size={19}/><span className="bag-label">Your bag</span><span className="bag-count">{cart.count}</span></button></div>
    </div></header>
    <main className="main-shell">
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="small-line"/>THE ART OF THE EVERYDAY</span><h1>Small rituals.<br/><em>Good living.</em></h1><p>Comforting scents. Thoughtful objects.<br/>Little things that make your day feel better.</p>
        <button className="hero-cta" onClick={scrollCatalog}>Find your everyday favourite <ArrowDown size={17}/></button><div className="hero-footnote"><span className="tiny-star">✳</span> Considered essentials, chosen with care.</div></div>
        <div className="hero-visual"><img src="/hero.svg" alt="Amber candle, botanical tea and ceramic cup arranged on a warm stone plinth"/><span className="hero-corner">LESS, BUT LOVELIER.</span>
          <div className="hero-caption"><span>THE SLOW LIVING EDIT</span><span>01 — 08 <ArrowUpRight size={16}/></span></div></div>
      </section>
      <div className="benefits"><span><PackageCheck size={18}/> Carefully selected</span><span><Truck size={19}/> Local delivery in Riga</span><span><ShieldCheck size={18}/> Easy ordering via Telegram</span></div>
      <section className="catalog" ref={catalogRef}>
        <div className="section-top"><div><span className="eyebrow">GOOD THINGS, RIGHT HERE</span><h2>The collection<span> / {String(regionalProducts.length).padStart(2, '0')}</span></h2></div><p>A few favourites for your everyday.</p></div>
        <div className="catalog-toolbar"><div className="search-field"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find your next favourite…" aria-label="Search products"/>
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16}/></button>}<kbd>SEARCH</kbd></div>
          <button className={'filter-button ' + (showFilters || stockOnly ? 'selected' : '')} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={17}/> Filters {stockOnly && <span className="live-dot"/>}</button>
        </div>
        {showFilters && <div className="filter-panel"><label className="checkbox-row"><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)}/> In stock only</label><button className="text-button" onClick={() => { setStockOnly(false); setSort('featured'); setQuery(''); setCategory('All products'); }}>Reset filters</button></div>}
        <div className="category-row"><div className="categories" role="group" aria-label="Product categories">{categories.map((c, index) => <button className={category === c ? 'selected' : ''} key={c} onClick={() => setCategory(c)}>{index === 0 ? <Sparkles size={15}/> : c === 'Home fragrance' ? <Flame size={15}/> : c === 'Tea & botanicals' ? <Leaf size={15}/> : null}{c}</button>)}</div>
          <label className="sort-control"><span>Sort by:</span><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div>
        {loading ? <div className="product-grid" aria-label="Loading collection">{Array.from({ length: 8 }, (_, i) => <div className="product-skeleton" key={i}><div/><span/><span/></div>)}</div>
          : error ? <div className="empty-state" role="alert"><CircleHelp size={34}/><h3>Taking a little pause.</h3><p>{error}</p><button className="primary" onClick={() => { void loadProducts(); }}>Try again</button></div>
          : filtered.length ? <div className="product-grid">{filtered.map(product => <ProductCard key={product.id} product={product} quantity={cart.items.find(i => i.product_id === product.id)?.qty ?? 0} onAdd={() => add(product)} onOpen={() => { if (checkoutLocked) setSheet('cart'); else setDetail(product); }}/>)}</div>
          : <div className="empty-state"><Search size={32}/><h3>No little favourites found.</h3><p>Try a different search or explore another category.</p><button className="text-button" onClick={() => { setQuery(''); setCategory('All products'); setStockOnly(false); }}>Clear filters <ArrowRight size={16}/></button></div>}
        {!loading && filtered.length > 0 && <div className="collection-end"><span/> <Leaf size={15}/> You've seen all {filtered.length} little favourites <span/></div>}
      </section>
      <section className="editorial-note"><span className="editorial-mark">a&s.</span><div><span className="eyebrow">A NOTE FROM US</span><h2>Everyday things.<br/><em>A little more considered.</em></h2></div><p>We believe the best things don't need to be complicated. Just well made, thoughtfully chosen, and a pleasure to come home to.</p></section>
    </main>
    <footer><div className="footer-inner"><span>© {new Date().getFullYear()} {config.shopName}</span><span>Made for slower moments <Leaf size={13}/></span><button onClick={() => setSheet('help')}>Delivery & information <ArrowUpRight size={14}/></button></div><p>{config.demoMode ? 'Demo shop · sample catalogue · no real delivery' : config.compliance.legalNotice}</p></footer>
    {cart.count > 0 && <button className="floating-bag" onClick={() => setSheet('cart')}><ShoppingBag size={19}/><span>Your bag <b>{cart.count}</b></span><strong>{money(cart.total)}</strong><ArrowRight size={18}/></button>}
    {toast && <div className="toast" role="status"><Check size={18}/>{toast}</div>}
    {sheet === 'cart' && <CartSheet cart={cart} config={config} products={products} district={district} onDistrict={setDistrict} onClose={() => setSheet(null)} onRefresh={loadProducts} onPendingChange={setCheckoutLocked}/>}
    {detail && <ProductDetail product={detail} products={regionalProducts} cart={cart} onClose={() => setDetail(null)}/>}
    {sheet === 'district' && <Modal title="A little closer to you" onClose={() => setSheet(null)}><div className="info-content"><MapPin size={30}/><h3>Where are we delivering?</h3><p>Select your district to see what's available near you.</p><div className="district-options">{config.districts.map(d => <button className={'option ' + (district === d ? 'selected' : '')} key={d} onClick={() => { setDistrict(d); setSheet(null); }}>{d}{district === d && <Check size={15}/>}</button>)}</div><p className="fine-print">Availability is checked again when you place your order.</p></div></Modal>}
    {sheet === 'help' && <Modal title="Good to know" onClose={() => setSheet(null)}><div className="info-content"><Leaf size={28}/><h3>A few taps. A little good.</h3><p>Explore the collection, add your favourites to your bag, and choose your delivery district. Place your order in Telegram — we'll send your confirmation and arrange the details in chat.</p><h4>Delivery & payment</h4><p>Local delivery is included in your order total. Available districts: {config.districts.join(', ')}. Pay on delivery; no online payment is collected. Delivery time is agreed in Telegram.</p><h4>Availability & returns</h4><p>Stock is checked when you order. For order questions or returns, reply to your order confirmation in the shop's Telegram chat.</p><p className="fine-print">{config.compliance.legalNotice}</p>{config.demoMode && <div className="notice">You're exploring a demo. Orders are samples and stock resets when the demo server restarts.</div>}</div></Modal>}
  </div>;
}
