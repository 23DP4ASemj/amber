import React, { useState } from 'react';
import { useCart } from '../hooks/useCart';

interface CartSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const LOCATIONS = ['Centrs', 'Imanta', 'Zolitūde', 'Salaspils'] as const;

export function CartSheet({ isOpen, onClose }: CartSheetProps) {
  const { cart, totalAmount, clearCart, updateQuantity } = useCart();
  const [selectedLocation, setSelectedLocation] = useState<string>(LOCATIONS[0]);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSent, setOrderSent] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    setIsSubmitting(true);

    const tg = (window as any).Telegram?.WebApp;
    const tgUser = tg?.initDataUnsafe?.user;

    const orderData = {
      telegramId: tgUser?.id ? String(tgUser.id) : 'Не определен',
      username: tgUser?.username ? `@${tgUser.username}` : '',
      firstName: tgUser?.first_name || 'Покупатель',
      location: selectedLocation,
      comment: comment.trim(),
      items: Object.values(cart).map((item: any) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity,
      })),
      total: totalAmount,
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (res.ok) {
        setOrderSent(true);
        clearCart();
        if (tg?.sendData) {
          tg.sendData(JSON.stringify(orderData));
        }
      } else {
        alert('Ошибка при оформлении заказа. Попробуйте снова.');
      }
    } catch (e) {
      console.error(e);
      alert('Сетевая ошибка при отправке.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-slate-900 h-full flex flex-col p-5 overflow-y-auto border-l border-slate-800">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">Корзина</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 text-xl">✕</button>
        </div>

        {orderSent ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold mb-2 text-white">Заказ принят!</h3>
            <p className="text-slate-400 text-sm mb-6">
              Точка: <b>{selectedLocation}</b>.<br />
              Менеджер свяжется с вами в Telegram.
            </p>
            <button
              onClick={() => {
                setOrderSent(false);
                onClose();
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-semibold"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {Object.values(cart).length === 0 ? (
                <div className="text-center text-slate-500 py-8">Корзина пуста</div>
              ) : (
                Object.values(cart).map((item: any) => (
                  <div key={item.id} className="bg-slate-800/70 p-3 rounded-xl flex justify-between items-center border border-slate-800">
                    <div>
                      <div className="font-semibold text-sm text-white">{item.name}</div>
                      <div className="text-xs text-blue-400 font-bold mt-0.5">{item.price} € × {item.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center font-bold text-slate-300"
                      >
                        -
                      </button>
                      <span className="text-sm font-bold min-w-4 text-center text-white">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-7 h-7 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800">
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
                📍 Выберите точку выдачи:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setSelectedLocation(loc)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      selectedLocation === loc
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Комментарий (время, пожелания)..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Итого к оплате:</span>
                <span className="text-lg font-bold text-blue-400">{totalAmount} €</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={isSubmitting || Object.keys(cart).length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-600/30 transition-all"
              >
                {isSubmitting ? 'Отправка...' : `Подтвердить заказ (${selectedLocation})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}