<template>
  <div class="callback-page">
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else>Signing you in&hellip;</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth.js'

const router = useRouter()
const { loginWithToken } = useAuth()
const error = ref(null)

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) {
    error.value = 'No authorization code received.'
    return
  }
  try {
    const res = await fetch(
      'http://localhost:8180/realms/catsnap/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'http://localhost:5173/callback',
          client_id: 'catsnap',
        }),
      }
    )
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error_description || 'Token exchange failed.'
      return
    }
    loginWithToken(data.access_token)
    router.replace('/')
  } catch {
    error.value = 'Network error during sign-in.'
  }
})
</script>

<style scoped>
.callback-page {
  max-width: 380px;
  margin: 80px auto;
  padding: 0 1rem;
  font-family: sans-serif;
  text-align: center;
  color: #444;
}

.error { color: #c0392b; }
</style>
