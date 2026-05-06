import { createRouter, createWebHistory } from 'vue-router'
import AdminPage from '../pages/AdminPage.vue'
import ClientPage from '../pages/ClientPage.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'client', component: ClientPage },
    { path: '/admin', name: 'admin', component: AdminPage },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage }
  ],
  scrollBehavior() {
    return { top: 0, left: 0, behavior: 'auto' }
  }
})

export default router
