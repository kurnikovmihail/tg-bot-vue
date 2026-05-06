import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Surrogate-Control': 'no-store'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // Explicit compatibility floor for popular browsers, including older Safari/iOS.
    target: ['chrome96', 'edge96', 'firefox95', 'safari15', 'ios15'],
    cssTarget: ['chrome96', 'edge96', 'firefox95', 'safari15', 'ios15']
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    headers: noCacheHeaders
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    headers: noCacheHeaders
  }
})
