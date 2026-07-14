import { ref } from 'vue'

const KC_TOKEN_KEY = 'kc_token'
const user = ref(null)
let _initPromise = null

function getKcToken() { return localStorage.getItem(KC_TOKEN_KEY) }
function setKcToken(token) { localStorage.setItem(KC_TOKEN_KEY, token) }
function clearKcToken() { localStorage.removeItem(KC_TOKEN_KEY) }

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

export function apiFetch(url, options = {}) {
  const kcToken = getKcToken()
  const merged = { credentials: 'include', ...options }
  if (kcToken) {
    merged.headers = { ...options.headers, Authorization: `Bearer ${kcToken}` }
  }
  return fetch(url, merged)
}

export function useAuth() {
  function init() {
    if (!_initPromise) {
      const kcToken = getKcToken()
      if (kcToken) {
        const claims = decodeJwt(kcToken)
        if (claims && claims.exp * 1000 > Date.now()) {
          user.value = claims.preferred_username || claims.email || claims.sub
          _initPromise = Promise.resolve()
          return _initPromise
        }
        clearKcToken()
      }
      _initPromise = fetch('/api/auth/me', { credentials: 'include' })
        .then(async res => {
          if (res.ok) {
            const d = await res.json()
            user.value = d.username || d.email
          }
        })
        .catch(() => {})
    }
    return _initPromise
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Login failed')
    user.value = data.username || data.email
  }

  async function register(email, username, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
      credentials: 'include',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Registration failed')
    return data.email
  }

  async function verify(email, code) {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
      credentials: 'include',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Verification failed')
    user.value = data.username || data.email
  }

  async function logout() {
    clearKcToken()
    _initPromise = null
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    user.value = null
  }

  function loginWithToken(accessToken) {
    setKcToken(accessToken)
    const claims = decodeJwt(accessToken)
    user.value = claims?.preferred_username || claims?.email || claims?.sub || 'user'
    _initPromise = Promise.resolve()
  }

  return { user, init, login, register, verify, logout, loginWithToken }
}
