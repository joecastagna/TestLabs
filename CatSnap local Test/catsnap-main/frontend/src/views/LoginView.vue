<template>
  <div class="auth-page">
    <h1>Log in</h1>
    <form class="auth-form" @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    </form>
    <div class="divider"><span>or</span></div>
    <a
      class="btn-google"
      href="http://localhost:8180/realms/catsnap/protocol/openid-connect/auth?client_id=catsnap&redirect_uri=http://localhost:5173/callback&response_type=code&scope=openid email profile"
    >Sign in with Google</a>
    <p class="switch-link">Don't have an account? <RouterLink to="/register">Register</RouterLink></p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const { login } = useAuth()
const router    = useRouter()

const email    = ref('')
const password = ref('')
const errorMsg = ref(null)
const loading  = ref(false)

async function submit() {
  errorMsg.value = null
  loading.value  = true
  try {
    await login(email.value, password.value)
    router.push('/')
  } catch (e) {
    errorMsg.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  max-width: 380px;
  margin: 80px auto;
  padding: 0 1rem;
  font-family: sans-serif;
}

h1 { font-size: 1.5rem; margin: 0 0 1.5rem; color: #222; }

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
  color: #444;
}

.auth-form input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.auth-form input:focus { outline: none; border-color: #555; }

.auth-form button {
  padding: 0.6rem;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 0.25rem;
}

.auth-form button:disabled { opacity: 0.6; cursor: default; }

.error { color: #c0392b; margin: 0; font-size: 0.875rem; }

.divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.25rem 0 1rem;
  color: #aaa;
  font-size: 0.8rem;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid #e0e0e0;
}

.btn-google {
  display: block;
  text-align: center;
  padding: 0.6rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  color: #333;
  text-decoration: none;
  background: #fff;
}

.btn-google:hover { background: #f5f5f5; }

.switch-link {
  margin-top: 1.25rem;
  font-size: 0.875rem;
  color: #555;
  text-align: center;
}

.switch-link a { color: #333; }

@media (max-width: 639px) {
  .auth-page { margin-top: 2rem; }
}
</style>
