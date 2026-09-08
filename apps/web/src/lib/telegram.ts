import type { TelegramUser } from '../../../../shared/types';
interface TelegramWebApp {
  initData: string; initDataUnsafe: { user?: TelegramUser }; platform: string;
  ready(): void; expand(): void; close(): void; isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void; setBackgroundColor(color: string): void;
  HapticFeedback?: { impactOccurred(style: 'light'): void; notificationOccurred(type: 'success' | 'error'): void };
  BackButton: { show(): void; hide(): void; onClick(fn: () => void): void; offClick(fn: () => void): void };
}
declare global { interface Window { Telegram?: { WebApp: TelegramWebApp } } }
export const telegram = () => window.Telegram?.WebApp;
export function initializeTelegram() {
  const app = telegram();
  if (!app?.initData) return;
  app.ready(); app.expand();
  if (app.isVersionAtLeast('6.1')) { app.setHeaderColor('#151714'); app.setBackgroundColor('#151714'); }
}
export function haptic() { const app = telegram(); if (app?.initData && app.isVersionAtLeast('6.1')) app.HapticFeedback?.impactOccurred('light'); }

