import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initializeTelegram } from './lib/telegram';
import './styles.css';
initializeTelegram();
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

