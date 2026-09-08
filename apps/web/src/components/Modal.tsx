import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { telegram } from '../lib/telegram';
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const back = telegram()?.initData ? telegram()?.BackButton : undefined;
    const close = () => closeRef.current();
    back?.show(); back?.onClick(close);
    return () => { dialog.close(); document.body.style.overflow = overflow; back?.offClick(close); back?.hide(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={'sheet ' + (wide ? 'sheet-wide' : '')} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-inner"><div className="sheet-handle" /><div className="sheet-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={22}/></button></div>{children}</div>
  </dialog>;
}

