<template>
  <div class="auth-page">
    <h1>Verify your email</h1>
    <p class="subtitle">We sent a 6-digit code to <strong>{{ email }}</strong></p>
    <form class="auth-form" @submit.prevent="submit">
      <label>
        Verification code
        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          pattern="\d{6}"
          maxlength="6"
          placeholder="000000"
          required
          autocomplete="one-time-code"
        />
      </label>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Verifying…' : 'Verify' }}</button>
    </form>
    <p class="switch-link"><RouterLink to="/login">Back to login</RouterLink></p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const route  = useRoute()
const router = useRouter()
const { verify } = useAuth()

const email    = route.query.email ?? ''
const code     = ref('')
const errorMsg = ref(null)
const loading  = ref(false)

async function submit() {
  errorMsg.value = null
  loading.value  = true
  try {
    await verify(email, code.value)
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

h1 { font-size: 1.5rem; margin: 0 0 0.5rem; color: #222; }

.subtitle {
  font-size: 0.9rem;
  color: #555;
  margin: 0 0 1.5rem;
}

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
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  text-align: center;
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
