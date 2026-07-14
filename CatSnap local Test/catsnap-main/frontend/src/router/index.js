import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',         component: () => import('../views/MapView.vue') },
    { path: '/login',    component: () => import('../views/LoginView.vue') },
    { path: '/register', component: () => import('../views/RegisterView.vue') },
    { path: '/profile',  component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
    { path: '/verify',   component: () => import('../views/VerifyView.vue') },
    { path: '/callback', component: () => import('../views/CallbackView.vue') },
  ],
})

router.beforeEach(async (to) => {
  const { user, init } = useAuth()
  await init()
  if (to.meta.requiresAuth && !user.value) return '/login'
})

export default router
