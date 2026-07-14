<template>
  <div class="map-view" :class="{ 'sidebar--open': sidebarOpen }">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Sightings</span>
        <span class="sidebar-count">{{ sightings.length }}</span>
        <button class="sidebar-close" @touchend.prevent="sidebarOpen = false" @click="sidebarOpen = false" aria-label="Close sightings">✕</button>
      </div>
      <p v-if="user" class="sidebar-hint">Click the map to log a sighting</p>
      <div class="sidebar-list">
        <p v-if="sightings.length === 0" class="sidebar-empty">No sightings yet.</p>
        <button
          v-for="s in sightings"
          :key="s.id"
          class="sidebar-item"
          @click="flyToSighting(s)"
        >
          <div class="si-top">
            <span class="si-label">{{ s.color }} · {{ s.pattern }}</span>
            <span class="si-time">{{ timeAgo(s.createdAt) }}</span>
          </div>
          <p v-if="s.description" class="si-desc">{{ s.description }}</p>
          <img v-if="s.photoUrl" :src="s.photoUrl" class="si-photo" :alt="`${s.color} cat`" loading="lazy" />
        </button>
      </div>
    </aside>

    <!-- Map area -->
    <div class="map-area">
      <div ref="mapEl" class="map"></div>
      <button class="sidebar-toggle" @touchend.prevent="sidebarOpen = true" @click="sidebarOpen = true" aria-label="Show sightings list">
        Sightings ({{ sightings.length }})
      </button>

      <!-- Sighting form — logged-in users only -->
      <div v-if="pendingLatLng" class="sighting-panel">
        <p class="panel-title">Log a sighting</p>
        <form @submit.prevent="submitSighting">
          <label class="panel-label">
            Color
            <select v-model="sightingColor" class="panel-select">
              <option value="">— select —</option>
              <option v-for="c in COLORS" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="panel-label">
            Pattern
            <select v-model="sightingPattern" class="panel-select">
              <option value="">— select —</option>
              <option v-for="p in PATTERNS" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>
          <label class="panel-label">
            Description
            <span class="optional">optional</span>
            <textarea v-model="sightingDescription" class="panel-textarea" rows="3" placeholder="Any details…" />
          </label>
          <label class="panel-label">
            Photo
            <span class="optional">optional</span>
            <input type="file" accept="image/*" capture="environment" class="panel-file" @change="onPhotoChange" />
            <img v-if="photoPreview" :src="photoPreview" class="photo-preview" alt="Preview" />
          </label>
          <div v-if="classifying" class="detecting-badge">Detecting coat type…</div>
          <div v-else-if="detectedCoat" class="detected-coat">
            <span>Auto-detected: <strong style="text-transform:capitalize">{{ detectedCoat.type }}</strong></span>
            <span class="confidence-pct">{{ Math.round(detectedCoat.confidence * 100) }}%</span>
          </div>
          <p v-if="nearbyCats > 0" class="nearby-hint">
            {{ nearbyCats }} cat{{ nearbyCats === 1 ? '' : 's' }} spotted within 5 miles
          </p>
          <p v-if="sightingError" class="error">{{ sightingError }}</p>
          <div class="panel-actions">
            <button type="submit" class="btn-primary" :disabled="sightingLoading">
              {{ sightingLoading ? 'Saving…' : 'Log sighting' }}
            </button>
            <button type="button" class="btn-secondary" @click="cancelSighting">Cancel</button>
          </div>
        </form>
      </div>

      <!-- Guest click hint -->
      <Transition name="fade">
        <div v-if="guestHint" class="guest-hint">
          <RouterLink to="/login">Log in</RouterLink> to add sightings
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAuth, apiFetch } from '../composables/useAuth.js'

const { user } = useAuth()

const COLOR_HEX = {
  orange: '#FF8C00',
  black:  '#222222',
  white:  '#EEEEEE',
  grey:   '#888888',
  brown:  '#8B4513',
  cream:  '#FFFDD0',
  tabby:  '#D2691E',
  calico: '#FF6347',
  other:  '#9370DB',
}

const COLORS   = ['orange', 'black', 'white', 'grey', 'brown', 'cream', 'tabby', 'calico', 'other']
const PATTERNS = ['solid', 'tabby', 'spotted', 'patched', 'other']

// ── Map state ────────────────────────────────────────────────────────────────
const mapEl     = ref(null)
const sightings = ref([])
let mapInstance  = null
let markersById  = {}

// ── Sidebar state ────────────────────────────────────────────────────────────
const sidebarOpen = ref(false)

// ── Sighting form state ──────────────────────────────────────────────────────
const pendingLatLng       = ref(null)
const sightingColor       = ref('')
const sightingPattern     = ref('')
const sightingDescription = ref('')
const sightingPhoto       = ref(null)
const photoPreview        = ref(null)
const sightingError       = ref(null)
const sightingLoading     = ref(false)

// ── GPS state (set once geolocation resolves) ────────────────────────────────
const userPosition = ref(null)

// ── Classifier state ─────────────────────────────────────────────────────────
const classifying  = ref(false)
const detectedCoat = ref(null)  // { type, confidence } when classifier returns

// ── Guest hint state ─────────────────────────────────────────────────────────
const guestHint = ref(false)
let guestHintTimer = null

function showGuestHint() {
  guestHint.value = true
  clearTimeout(guestHintTimer)
  guestHintTimer = setTimeout(() => { guestHint.value = false }, 3000)
}

// ── Sighting form actions ────────────────────────────────────────────────────
function openSightingForm(latlng) {
  pendingLatLng.value       = latlng
  sightingColor.value       = ''
  sightingPattern.value     = ''
  sightingDescription.value = ''
  sightingError.value       = null
  sightingPhoto.value       = null
  detectedCoat.value        = null
  if (photoPreview.value) { URL.revokeObjectURL(photoPreview.value); photoPreview.value = null }
  sidebarOpen.value         = false
}

function cancelSighting() {
  pendingLatLng.value = null
  sightingPhoto.value = null
  detectedCoat.value  = null
  if (photoPreview.value) { URL.revokeObjectURL(photoPreview.value); photoPreview.value = null }
}

// Coat type → color/pattern pre-fill mapping
const COAT_MAP = {
  tabby:   { color: 'tabby',  pattern: 'tabby' },
  tuxedo:  { color: 'black',  pattern: 'patched' },
  orange:  { color: 'orange', pattern: 'solid' },
  black:   { color: 'black',  pattern: 'solid' },
  white:   { color: 'white',  pattern: 'solid' },
  calico:  { color: 'calico', pattern: 'patched' },
  spotted: { color: 'grey',   pattern: 'spotted' },
}

async function onPhotoChange(e) {
  const file = e.target.files[0] ?? null
  sightingPhoto.value = file
  detectedCoat.value  = null
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoPreview.value = file ? URL.createObjectURL(file) : null

  if (!file) return
  classifying.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await apiFetch('/api/sightings/classify-preview', { method: 'POST', body: fd })
    if (res.ok) {
      const { coatType, confidence } = await res.json()
      detectedCoat.value = { type: coatType, confidence }
      const mapping = COAT_MAP[coatType]
      if (mapping) {
        sightingColor.value   = mapping.color
        sightingPattern.value = mapping.pattern
      }
    }
  } catch { /* best-effort */ } finally {
    classifying.value = false
  }
}

// ── Nearby cats (within 5 miles of user GPS position) ────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959 // miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const nearbyCats = computed(() => {
  if (!userPosition.value) return 0
  const { latitude: lat1, longitude: lon1 } = userPosition.value
  return sightings.value.filter(s =>
    haversine(lat1, lon1, +s.latitude, +s.longitude) <= 5
  ).length
})

async function submitSighting() {
  if (!sightingColor.value)   { sightingError.value = 'Please select a color';   return }
  if (!sightingPattern.value) { sightingError.value = 'Please select a pattern'; return }
  sightingError.value   = null
  sightingLoading.value = true
  try {
    const fd = new FormData()
    fd.append('color',    sightingColor.value)
    fd.append('pattern',  sightingPattern.value)
    if (sightingDescription.value) fd.append('description', sightingDescription.value)
    fd.append('latitude',  String(pendingLatLng.value.lat))
    fd.append('longitude', String(pendingLatLng.value.lng))
    if (userPosition.value) {
      fd.append('gpsLatitude',  String(userPosition.value.latitude))
      fd.append('gpsLongitude', String(userPosition.value.longitude))
    }
    if (sightingPhoto.value) fd.append('photo', sightingPhoto.value)

    const res = await apiFetch('/api/sightings', {
      method: 'POST',
      body: fd,
    })
    const data = await res.json()
    if (!res.ok) { sightingError.value = data.error ?? 'Failed to save sighting'; return }
    addSightingMarker(data)
    sightings.value = [data, ...sightings.value]
    pendingLatLng.value = null
    sightingPhoto.value = null
    if (photoPreview.value) { URL.revokeObjectURL(photoPreview.value); photoPreview.value = null }
  } catch {
    sightingError.value = 'Network error — please try again'
  } finally {
    sightingLoading.value = false
  }
}

// ── Sidebar action ───────────────────────────────────────────────────────────
function flyToSighting(s) {
  cancelSighting()
  sidebarOpen.value = false
  mapInstance.flyTo([s.latitude, s.longitude], Math.max(mapInstance.getZoom(), 15))
  markersById[s.id]?.openPopup()
}

// ── Time formatting ──────────────────────────────────────────────────────────
function timeAgo(isoString) {
  const sec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (sec < 60)           return 'just now'
  if (sec < 3600)         return `${Math.floor(sec / 60)} minutes ago`
  if (sec < 86400)        return `${Math.floor(sec / 3600)} hours ago`
  if (sec < 86400 * 7)   return `${Math.floor(sec / 86400)} days ago`
  if (sec < 86400 * 30)  return `${Math.floor(sec / (86400 * 7))} weeks ago`
  return                         `${Math.floor(sec / (86400 * 30))} months ago`
}

// ── Map init ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  const data = await fetch('/api/sightings', { credentials: 'include' }).then(r => r.json())
  sightings.value = data

  const newest = data[0]
  const center  = newest ? [newest.latitude, newest.longitude] : [51.505, -0.091]
  const zoom    = newest ? 15 : 13

  mapInstance = L.map(mapEl.value).setView(center, zoom)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(mapInstance)

  for (const s of data) addSightingMarker(s)

  if (newest) markersById[newest.id].openPopup()

  mapInstance.on('click', (e) => {
    if (e.originalEvent.target.closest('.leaflet-interactive')) return
    if (!user.value) { showGuestHint(); return }
    openSightingForm(e.latlng)
  })

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mapInstance) return
        userPosition.value = coords
        L.circleMarker([coords.latitude, coords.longitude], {
          radius: 8,
          fillColor: '#4A90D9',
          fillOpacity: 1,
          color: '#fff',
          weight: 3,
          interactive: false,
        }).bindTooltip('Your location').addTo(mapInstance)
        mapInstance.flyTo([coords.latitude, coords.longitude], 15)
      },
      () => {},
      { timeout: 10000, maximumAge: 300000 },
    )
  }
})

onUnmounted(() => {
  clearTimeout(guestHintTimer)
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  mapInstance?.remove()
  mapInstance = null
  markersById = {}
})

// ── Marker helpers ────────────────────────────────────────────────────────────
function addSightingMarker(s) {
  const fill = COLOR_HEX[s.color] ?? COLOR_HEX.other
  const needsDarkBorder = s.color === 'white' || s.color === 'cream'
  const marker = L.circleMarker([s.latitude, s.longitude], {
    radius:      10,
    fillColor:   fill,
    fillOpacity: 0.8,
    color:       needsDarkBorder ? '#555555' : '#1a1a1a',
    weight:      2,
  }).bindPopup(popupHtml(s)).addTo(mapInstance)
  markersById[s.id] = marker
}

function popupHtml(s) {
  const date = new Date(s.createdAt).toLocaleString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  return [
    s.photoUrl
      ? `<img src="${s.photoUrl}" style="display:block;width:180px;max-width:100%;height:120px;object-fit:cover;border-radius:4px;margin-bottom:6px">`
      : '',
    s.catName ? `<div style="font-size:0.88em;color:#888;margin-bottom:3px">${s.catName}</div>` : '',
    `<strong style="text-transform:capitalize">${s.color} · ${s.pattern}</strong>`,
    s.coatTypeDetected
      ? `<span style="font-size:0.78em;color:#aaa;margin-left:4px">(${s.coatTypeDetected} detected)</span>`
      : '',
    s.description ? `<p style="margin:4px 0 0">${s.description}</p>` : '',
    `<p style="margin:4px 0 0;color:#666;font-size:0.85em">Spotted ${date}</p>`,
  ].join('')
}
</script>

<style scoped>
.map-view {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  font-family: sans-serif;
}

/* ── Sidebar ── */
.sidebar {
  width: 264px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e0e0e0;
  background: #fafafa;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.sidebar-title { font-weight: 600; font-size: 0.9rem; color: #222; }

.sidebar-count {
  font-size: 0.75rem;
  background: #e0e0e0;
  color: #555;
  padding: 0.1rem 0.45rem;
  border-radius: 10px;
  font-weight: 600;
}

.sidebar-hint {
  margin: 0;
  padding: 0.4rem 1rem;
  font-size: 0.78rem;
  color: #888;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
}

.sidebar-empty {
  padding: 1.25rem 1rem;
  font-size: 0.85rem;
  color: #999;
  margin: 0;
}

.sidebar-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.65rem 1rem;
  border: none;
  border-bottom: 1px solid #ececec;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.sidebar-item:hover { background: #f0f0f0; }
.sidebar-item:last-child { border-bottom: none; }

.si-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.si-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #222;
  text-transform: capitalize;
}

.si-time {
  font-size: 0.75rem;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
}

.si-desc {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Map area ── */
.map-area {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 0;
}

.map {
  width: 100%;
  height: calc(100vh - 48px);
  overflow: hidden;
}

/* ── Guest hint ── */
.guest-hint {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  padding: 0.45rem 1rem;
  border-radius: 20px;
  font-size: 0.875rem;
  white-space: nowrap;
  pointer-events: auto;
}

.guest-hint a { color: #89c3ff; text-decoration: none; }
.guest-hint a:hover { text-decoration: underline; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── Sighting form panel ── */
.sighting-panel {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1000;
  width: 272px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.panel-title { margin: 0; font-weight: 600; font-size: 1rem; color: #222; }

.panel-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: #444;
}

.optional { font-size: 0.75rem; color: #999; }

.panel-select,
.panel-textarea {
  padding: 0.4rem 0.6rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
  background: #fff;
}

.panel-select:focus,
.panel-textarea:focus { outline: none; border-color: #555; }

.panel-textarea { resize: vertical; }

.panel-actions { display: flex; gap: 0.5rem; padding-top: 0.25rem; }

.btn-primary {
  flex: 1;
  padding: 0.5rem;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-primary:disabled { opacity: 0.6; cursor: default; }

.btn-secondary {
  padding: 0.5rem 0.75rem;
  background: transparent;
  color: #555;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}

.btn-secondary:hover { background: #f5f5f5; }

.panel-file {
  font-size: 0.85rem;
  color: #555;
  cursor: pointer;
}

.photo-preview {
  width: 100%;
  max-height: 120px;
  object-fit: cover;
  border-radius: 4px;
  margin-top: 0.25rem;
}

.si-photo {
  display: block;
  width: 100%;
  max-height: 100px;
  object-fit: cover;
  border-radius: 4px;
  margin-top: 0.4rem;
}

.detecting-badge {
  font-size: 0.78rem;
  color: #999;
  font-style: italic;
}

.detected-coat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #444;
  background: #f0f9f0;
  border: 1px solid #c3e6cb;
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
}

.confidence-pct {
  font-size: 0.73rem;
  color: #666;
  background: #d4edda;
  padding: 0.1rem 0.35rem;
  border-radius: 10px;
}

.nearby-hint {
  font-size: 0.78rem;
  color: #888;
  margin: 0;
  font-style: italic;
}

.error { color: #c0392b; margin: 0; font-size: 0.9rem; }

/* ── Sidebar toggle FAB and close button (hidden on desktop) ── */
.sidebar-toggle { display: none; }
.sidebar-close  { display: none; }

/* ── Tablet: slightly narrower sidebar and panel ── */
@media (max-width: 900px) and (min-width: 640px) {
  .sidebar        { width: 220px; }
  .sighting-panel { width: 240px; }
}

/* ── Mobile ── */
@media (max-width: 639px) {
  /* Positioning context for the absolute sidebar overlay */
  .map-view {
    position: relative;
  }

  /* Sidebar: hidden by default, shown as a bottom drawer when open.
     Using display rather than transform so the toggle is unambiguous
     and not affected by overflow/transform clipping edge cases. */
  .sidebar {
    display: none;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    width: auto;
    max-height: 55vh;
    /* Above Leaflet's control layer (z-index 1000) */
    z-index: 1300;
    border-right: none;
    border-top: 1px solid #e0e0e0;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
  }

  .sidebar--open .sidebar {
    display: flex;
  }

  /* Close button inside sidebar header */
  .sidebar-close {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    color: #666;
    font-size: 1rem;
    cursor: pointer;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sidebar-close:hover { background: #ebebeb; }

  /* FAB: fixed so overflow:hidden on ancestors can't clip it */
  .sidebar-toggle {
    display: block;
    position: fixed;
    bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
    left: 1rem;
    z-index: 1200;
    padding: 0.5rem 1.1rem;
    background: #333;
    color: #fff;
    border: none;
    border-radius: 20px;
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    touch-action: manipulation;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  }

  .sidebar-toggle:hover { background: #444; }

  /* Hide FAB when sidebar is open */
  .sidebar--open .sidebar-toggle { display: none; }

  /* Sighting form: bottom sheet */
  .sighting-panel {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: auto;
    border-radius: 12px 12px 0 0;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 1400;
  }
}
</style>
