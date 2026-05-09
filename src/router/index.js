import { createRouter, createWebHistory } from 'vue-router'
import AdminPage from '../pages/AdminPage.vue'
import ClientPage from '../pages/ClientPage.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'
import { getOrCreateActiveUserId, isAdminUser } from '../core/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'client', component: ClientPage },
    {
      path: '/admin',
      name: 'admin',
      component: AdminPage,
      beforeEnter() {
        const userId = getOrCreateActiveUserId()
        if (!isAdminUser(userId)) {
          return { path: '/', query: { adminDenied: '1' } }
        }
        return true
      }
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage }
  ],
  scrollBehavior() {
    return { top: 0, left: 0, behavior: 'auto' }
  }
})

export default router
