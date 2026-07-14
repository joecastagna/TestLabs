<template>
  <div class="profile-page">
    <div class="profile-content">

      <div class="page-header">
        <h1>Profile</h1>
        <p class="user-username">{{ meData?.username ?? user }}</p>
        <p v-if="meData?.email" class="user-email">{{ meData.email }}</p>
      </div>

      <div v-if="loadError" class="load-error">{{ loadError }}</div>

      <template v-else>
        <!-- ── Stats ───────────────────────────────────────────────────── -->
        <section class="section">
          <h2>Stats</h2>
          <div class="stats-grid">
            <div class="stat">
              <span class="stat-value">{{ sightings.length }}</span>
              <span class="stat-label">Sightings logged</span>
            </div>
            <div class="stat">
              <span class="stat-value" style="text-transform:capitalize">{{ topColor ?? '—' }}</span>
              <span class="stat-label">Most common color</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ firstSightingDate ?? '—' }}</span>
              <span class="stat-label">First sighting</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ daysSinceJoinedLabel ?? '—' }}</span>
              <span class="stat-label">Days since joined</span>
            </div>
          </div>
        </section>

        <!-- ── My sightings ───────────────────────────────────────────── -->
        <section class="section">
          <h2>My sightings</h2>
          <p v-if="!loading && sightings.length === 0" class="empty">
            You haven't logged any sightings yet.
          </p>
          <ul class="sightings-list">
            <li v-for="s in sightings" :key="s.id" class="sighting-item">
              <div class="si-main">
                <div class="si-top">
                  <span class="si-label">{{ s.color }} · {{ s.pattern }}</span>
                  <span class="si-date">{{ formatDate(s.createdAt) }}</span>
                </div>
                <p v-if="s.description" class="si-desc">{{ s.description }}</p>
              </div>
              <button
                class="delete-btn"
                :disabled="deleting === s.id"
                @click="deleteSighting(s.id)"
              >{{ deleting === s.id ? '…' : 'Delete' }}</button>
            </li>
          </ul>
        </section>

        <!-- ── Edit username ──────────────────────────────────────────── -->
        <section class="section">
          <div class="pw-header">
            <h2>Username</h2>
            <button v-if="!unOpen" class="btn-toggle" @click="openUnForm">Edit username</button>
            <p v-if="unSuccess" class="msg success">{{ unSuccess }}</p>
          </div>
          <form v-if="unOpen" class="pw-form" @submit.prevent="changeUsername">
            <label>
              New username
              <input v-model="unValue" type="text" autocomplete="username" />
            </label>
            <p v-if="unError" class="msg error">{{ unError }}</p>
            <div class="pw-actions">
              <button type="submit" :disabled="unLoading">
                {{ unLoading ? 'Saving…' : 'Save username' }}
              </button>
              <button type="button" class="btn-cancel" @click="closeUnForm">Cancel</button>
            </div>
          </form>
        </section>

        <!-- ── Change password ────────────────────────────────────────── -->
        <section class="section">
          <div class="pw-header">
            <h2>Change password</h2>
            <button v-if="!pwOpen" class="btn-toggle" @click="openPwForm">Change password</button>
            <p v-if="pwSuccess" class="msg success">{{ pwSuccess }}</p>
          </div>
          <form v-if="pwOpen" class="pw-form" @submit.prevent="changePassword">
            <label>
              Current password
              <input v-model="currentPw" type="password" autocomplete="current-password" />
            </label>
            <label>
              New password
              <input v-model="newPw" type="password" autocomplete="new-password" />
            </label>
            <label>
              Confirm new password
              <input v-model="confirmPw" type="password" autocomplete="new-password" />
            </label>
            <p v-if="pwError" class="msg error">{{ pwError }}</p>
            <div class="pw-actions">
              <button type="submit" :disabled="pwLoading">
                {{ pwLoading ? 'Updating…' : 'Update password' }}
              </button>
              <button type="button" class="btn-cancel" @click="closePwForm">Cancel</button>
            </div>
          </form>
        </section>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth, apiFetch } from '../composables/useAuth.js'

const { user } = useAuth()

// ── Remote state ─────────────────────────────────────────────────────────────
const meData   = ref(null)
const sightings = ref([])
const loading  = ref(true)
const loadError = ref(null)

onMounted(async () => {
  try {
    const [meRes, sightingsRes] = await Promise.all([
      apiFetch('/api/auth/me').then(r => r.json()),
      apiFetch('/api/sightings/mine').then(r => r.json()),
    ])
    meData.value   = meRes
    sightings.value = sightingsRes
  } catch {
    loadError.value = 'Failed to load profile data — please refresh.'
  } finally {
    loading.value = false
  }
})

// ── Stats ─────────────────────────────────────────────────────────────────────
const topColor = computed(() => {
  if (!sightings.value.length) return null
  const counts = {}
  for (const s of sightings.value) counts[s.color] = (counts[s.color] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
})

const firstSightingDate = computed(() => {
  if (!sightings.value.length) return null
  const oldest = sightings.value[sightings.value.length - 1]
  return new Date(oldest.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
})

const daysSinceJoinedLabel = computed(() => {
  if (!meData.value?.createdAt) return null
  const days = Math.floor((Date.now() - new Date(meData.value.createdAt).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
})

// ── Sighting list helpers ─────────────────────────────────────────────────────
const deleting = ref(null)

async function deleteSighting(id) {
  deleting.value = id
  try {
    const res = await apiFetch(`/api/sightings/${id}`, { method: 'DELETE' })
    if (res.ok) sightings.value = sightings.value.filter(s => s.id !== id)
  } finally {
    deleting.value = null
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Edit username ─────────────────────────────────────────────────────────────
const unOpen    = ref(false)
const unValue   = ref('')
const unError   = ref(null)
const unSuccess = ref(null)
const unLoading = ref(false)

function openUnForm() {
  unOpen.value    = true
  unError.value   = null
  unValue.value   = meData.value?.username ?? ''
}

function closeUnForm() {
  unOpen.value  = false
  unError.value = null
}

async function changeUsername() {
  unError.value = null
  if (!unValue.value.trim()) { unError.value = 'Username cannot be empty'; return }

  unLoading.value = true
  try {
    const res = await apiFetch('/api/auth/username', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: unValue.value.trim() }),
    })
    if (!res.ok) {
      unError.value = (await res.json()).error ?? 'Failed to update username'
      return
    }
    const data = await res.json()
    meData.value = { ...meData.value, username: data.username }
    user.value   = data.username
    unSuccess.value = 'Username updated.'
    unOpen.value    = false
  } catch {
    unError.value = 'Network error — please try again'
  } finally {
    unLoading.value = false
  }
}

// ── Change password ───────────────────────────────────────────────────────────
const pwOpen    = ref(false)
const currentPw = ref('')
const newPw     = ref('')
const confirmPw = ref('')
const pwError   = ref(null)
const pwSuccess = ref(null)
const pwLoading = ref(false)

function openPwForm() {
  pwOpen.value    = true
  pwError.value   = null
  currentPw.value = ''
  newPw.value     = ''
  confirmPw.value = ''
}

function closePwForm() {
  pwOpen.value  = false
  pwError.value = null
}

async function changePassword() {
  pwError.value   = null
  if (newPw.value.length < 8) { pwError.value = 'New password must be at least 8 characters'; return }
  if (newPw.value !== confirmPw.value) { pwError.value = 'Passwords do not match'; return }

  pwLoading.value = true
  try {
    const res = await apiFetch('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPw.value, newPassword: newPw.value }),
    })
    if (!res.ok) {
      pwError.value = (await res.json()).error ?? 'Failed to update password'
      return
    }
    pwSuccess.value = 'Password updated successfully.'
    pwOpen.value    = false
  } catch {
    pwError.value = 'Network error — please try again'
  } finally {
    pwLoading.value = false
  }
}
</script>

<style scoped>
.profile-page {
  height: 100%;
  overflow-y: auto;
  font-family: sans-serif;
}

.profile-content {
  max-width: 640px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}

.page-header { margin-bottom: 2rem; }

h1 { font-size: 1.6rem; margin: 0 0 0.25rem; color: #111; }

.user-username { margin: 0 0 0.2rem; color: #333; font-size: 1rem; font-weight: 500; }
.user-email    { margin: 0; color: #999; font-size: 0.82rem; }

h2 { font-size: 1.05rem; font-weight: 600; color: #222; margin: 0 0 1rem; }

.section {
  margin-bottom: 2.5rem;
  padding-bottom: 2.5rem;
  border-bottom: 1px solid #eee;
}

.section:last-child { border-bottom: none; }

.load-error { color: #c0392b; padding: 1rem 0; }

/* ── Stats ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 1rem;
}

.stat {
  background: #f7f7f7;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.stat-value { font-size: 1.25rem; font-weight: 600; color: #111; line-height: 1.2; }
.stat-label { font-size: 0.78rem; color: #888; }

/* ── Sightings list ── */
.empty { color: #999; font-size: 0.9rem; margin: 0; }

.sightings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sighting-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 6px;
}

.si-main { flex: 1; min-width: 0; }

.si-top {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.si-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #222;
  text-transform: capitalize;
}

.si-date { font-size: 0.78rem; color: #999; }

.si-desc {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  flex-shrink: 0;
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
  color: #c0392b;
  background: transparent;
  border: 1px solid #e0b0b0;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.delete-btn:hover:not(:disabled) { background: #fff0f0; }
.delete-btn:disabled { opacity: 0.5; cursor: default; }

/* ── Password section ── */
.pw-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.pw-header h2 { margin: 0; }

.btn-toggle {
  padding: 0.35rem 0.85rem;
  font-size: 0.85rem;
  background: transparent;
  color: #444;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}

.btn-toggle:hover { background: #f5f5f5; }

.pw-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn-cancel {
  padding: 0.5rem 0.85rem;
  background: transparent;
  color: #555;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-cancel:hover { background: #f5f5f5; }

/* ── Password form ── */
.pw-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  max-width: 380px;
}

.pw-form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: #444;
}

.pw-form input {
  padding: 0.45rem 0.7rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
}

.pw-form input:focus { outline: none; border-color: #555; }

.pw-form button[type="submit"] {
  padding: 0.5rem 1.1rem;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}

.pw-form button:disabled { opacity: 0.6; cursor: default; }

.msg { margin: 0; font-size: 0.875rem; }
.error   { color: #c0392b; }
.success { color: #27ae60; }

@media (max-width: 639px) {
  .profile-content { padding: 1.5rem 1rem 3rem; }
  .sighting-item { flex-wrap: wrap; }
  .delete-btn { align-self: flex-start; }
}
</style>
