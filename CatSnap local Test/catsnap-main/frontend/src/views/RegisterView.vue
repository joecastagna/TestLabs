<template>
  <div class="auth-page">
    <h1>Create account</h1>
    <form class="auth-form" @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="email" />
        <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
      </label>
      <label>
        Username
        <input v-model="username" type="text" autocomplete="username" />
        <span v-if="errors.username" class="field-error">{{ errors.username }}</span>
      </label>
      <label>
        Password
        <input v-model="password" type="password" autocomplete="new-password" />
        <span v-if="errors.password" class="field-error">{{ errors.password }}</span>
      </label>
      <label>
        Confirm password
        <input v-model="confirm" type="password" autocomplete="new-password" />
        <span v-if="errors.confirm" class="field-error">{{ errors.confirm }}</span>
      </label>
      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Creating account…' : 'Create account' }}</button>
    </form>
    <p class="switch-link">Already have an account? <RouterLink to="/login">Log in</RouterLink></p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const { register } = useAuth()
const router       = useRouter()

const email    = ref('')
const username = ref('')
const password = ref('')
const confirm  = ref('')
const errors   = ref({})
const errorMsg = ref(null)
const loading  = ref(false)

function validate() {
  const e = {}
  if (!email.value.trim())              e.email    = 'Email is required'
  if (!username.value.trim())           e.username = 'Username is required'
  if (password.value.length < 8)        e.password = 'Password must be at least 8 characters'
  if (confirm.value !== password.value) e.confirm  = 'Passwords do not match'
  return e
}

async function submit() {
  errors.value  = validate()
  if (Object.keys(errors.value).length > 0) return
  errorMsg.value = null
  loading.value  = true
  try {
    const registeredEmail = await register(email.value, username.value, password.value)
    router.push(`/verify?email=${encodeURIComponent(registeredEmail)}`)
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

.field-error { color: #c0392b; font-size: 0.8rem; }
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
