import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'wicg-inert'
import './style.css'

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

createApp(App).use(router).mount('#app')
