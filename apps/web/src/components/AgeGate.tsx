import { ArrowUpRight, ShieldCheck, Leaf } from 'lucide-react';
import { useState } from 'react';
import type { PublicConfig } from '../../../../shared/types';
export function AgeGate({ config, onAccept }: { config: PublicConfig; onAccept: () => void }) {
  const [declined, setDeclined] = useState(false);
  return <main className="age-page"><div className="age-art"><img src="/hero.svg" alt="An amber candle, stoneware cup and botanical tea"/><span className="eyebrow">THOUGHTFULLY CHOSEN. EVERY DAY.</span></div>
    <section className="age-content"><div className="brand"><span className="brand-symbol"><Leaf size={22}/></span><span>{config.shopName}<small>THE EVERYDAY COLLECTION</small></span></div>
      <span className="eyebrow">A LITTLE MOMENT FOR YOURSELF</span><h1>Small rituals.<br/><em>Good living.</em></h1>
      <p>Considered objects, comforting scents, and a slower kind of everyday.</p>
      <div className="age-check"><ShieldCheck size={24}/><div><h2>{declined ? 'See you when the time is right.' : 'A quick check before you enter'}</h2>
        <p>{declined ? 'This shop is available to adults only.' : 'Please confirm that you are ' + config.compliance.minimumAge + ' or older to explore our collection.'}</p></div></div>
      {!declined && <><button className="primary" onClick={onAccept}>I am {config.compliance.minimumAge } or older <ArrowUpRight size={20}/></button>
      <button className="text-button" onClick={() => setDeclined(true)}>I am under {config.compliance.minimumAge}</button></>}
      <p className="fine-print">{config.compliance.legalNotice}</p>
      {config.demoMode && <span className="demo-label">Demo shop · sample products and orders</span>}
    </section></main>;
}

