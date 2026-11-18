import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch((err) => {
      console.warn('Service worker registration warning:', err);
    });
}

createRoot(document.getElementById('root')!).render(<App />);
