// Build 2026-05-13-v144 - CRITICAL CACHE BUSTER
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("%c Kreative Portal Booting... v1.4.4 ", "background: #4f46e5; color: #fff; font-weight: bold; padding: 4px; border-radius: 4px;");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
