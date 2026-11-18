import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const contentSecurityPolicy = (production) => [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self'",
  "manifest-src 'self'",
  production ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ')

const securityHeaders = (production) => ({
  'Content-Security-Policy': contentSecurityPolicy(production),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  ...(production ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
})

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    headers: securityHeaders(false),
  },
  preview: {
    port: 4173,
    headers: securityHeaders(true),
  },
})
