// src/config.js
// Central config – change VITE_BACKEND_URL in .env for production
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
