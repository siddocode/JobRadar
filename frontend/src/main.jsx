import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { LocationProvider } from './context/LocationContext'

// Default production Render backend endpoint
const DEFAULT_PROD_API = 'https://jobradar-xled.onrender.com';

// Automatically prefix relative /api calls when deployed in production or when VITE_API_URL is configured
const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const configuredBase = (import.meta.env.VITE_API_URL || '').trim();
const rawApiBase = configuredBase || (!isLocalhost ? DEFAULT_PROD_API : '');
const API_BASE = rawApiBase.replace(/\/+$/, '').replace(/\/api$/, '');

if (API_BASE) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string') {
      if (input.startsWith('/api')) {
        return originalFetch.call(this, `${API_BASE}${input}`, init);
      }
    } else if (input instanceof URL) {
      if (input.pathname.startsWith('/api')) {
        return originalFetch.call(this, `${API_BASE}${input.pathname}${input.search}`, init);
      }
    } else if (input instanceof Request) {
      try {
        const parsed = new URL(input.url);
        if (parsed.pathname.startsWith('/api') && parsed.origin === window.location.origin) {
          const proxiedUrl = `${API_BASE}${parsed.pathname}${parsed.search}`;
          return originalFetch.call(this, new Request(proxiedUrl, input), init);
        }
      } catch (_) {}
    }
    return originalFetch.call(this, input, init);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <LocationProvider>
        <App />
      </LocationProvider>
    </AuthProvider>
  </StrictMode>,
)
