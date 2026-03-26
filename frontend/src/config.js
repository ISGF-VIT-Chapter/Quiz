// src/config.js
// Central config – change VITE_BACKEND_URL in .env for production
const ENV_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const LOCAL_BACKEND_URL = 'http://localhost:5001';
const PROD_BACKEND_URL = 'http://iac-quiz-buzzer-website-production.up.railway.app';

const isLocalHost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

function sanitizeBackendUrl(url) {
  if (!url) return '';

  // Must be a full http(s) URL to avoid accidental relative-path calls to Vercel frontend.
  if (!/^https?:\/\//i.test(url)) return '';

  if (typeof window !== 'undefined') {
    try {
      const envHost = new URL(url).host;
      // If env URL points to current frontend host, API calls will hit index.html rewrites.
      if (envHost === window.location.host) return '';
    } catch {
      return '';
    }
  }

  return url;
}

const safeEnvBackendUrl = sanitizeBackendUrl(ENV_BACKEND_URL);

// In production, always use the known backend API host to avoid accidental Vercel/protected URL misconfigurations.
export const BACKEND_URL = isLocalHost
  ? (safeEnvBackendUrl || LOCAL_BACKEND_URL)
  : PROD_BACKEND_URL;
