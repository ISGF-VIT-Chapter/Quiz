// src/config.js
// Central config – change VITE_BACKEND_URL in .env for production
const ENV_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const LOCAL_BACKEND_URL = 'http://localhost:5001';
const PROD_BACKEND_URL = 'https://iac-quiz-buzzer-website-production.up.railway.app';

const isLocalHost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const BACKEND_URL = ENV_BACKEND_URL || (isLocalHost ? LOCAL_BACKEND_URL : PROD_BACKEND_URL);
