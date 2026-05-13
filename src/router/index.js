import { createRouter, createWebHistory } from 'vue-router'
import AdminPage from '../pages/AdminPage.vue'
import ClientPage from '../pages/ClientPage.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'
import { grantAdminAccessByPassword, isAdminAccessGranted } from '../core/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'client', component: ClientPage },
    {
      path: '/admin',
      name: 'admin',
      component: AdminPage,
      beforeEnter() {
        if (isAdminAccessGranted()) {
          return true
        }
        const password = window.prompt('Введите пароль для входа в админку:')
        if (password && grantAdminAccessByPassword(password)) {
          return true
        }
        if (!isAdminAccessGranted()) {
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
