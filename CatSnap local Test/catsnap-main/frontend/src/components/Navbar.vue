<template>
  <nav class="navbar">
    <RouterLink to="/" class="brand">CatSnap</RouterLink>
    <button
      class="hamburger"
      @click="toggleMenu"
      :aria-expanded="String(menuOpen)"
      aria-label="Toggle navigation"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div class="nav-links" :class="{ open: menuOpen }" @click="menuOpen = false">
      <template v-if="user">
        <span class="nav-user">{{ user }}</span>
        <RouterLink to="/profile" class="nav-link">Profile</RouterLink>
        <button class="nav-btn" @click.stop="handleLogout">Log out</button>
      </template>
      <template v-else>
        <RouterLink to="/login"    class="nav-link">Log in</RouterLink>
        <RouterLink to="/register" class="nav-link nav-cta">Register</RouterLink>
      </template>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { useRouter } from 'vue-router'

const { user, logout } = useAuth()
const router = useRouter()
const menuOpen = ref(false)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  padding: 0 1.25rem;
  height: 48px;
  background: #333;
  color: #fff;
  flex-shrink: 0;
  font-family: sans-serif;
  gap: 1rem;
  position: relative;
  /* Positive z-index creates a stacking context that paints above .main-content */
  z-index: 1;
}

.brand {
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.03em;
  color: #fff;
  text-decoration: none;
}

.nav-links {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.nav-user {
  font-size: 0.85rem;
  color: #ccc;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-link {
  font-size: 0.875rem;
  color: #ccc;
  text-decoration: none;
}

.nav-link:hover { color: #fff; }

.nav-cta {
  padding: 0.3rem 0.75rem;
  border: 1px solid #666;
  border-radius: 4px;
  color: #fff;
}

.nav-cta:hover { background: #444; }

.nav-btn {
  padding: 0.3rem 0.75rem;
  background: transparent;
  color: #ccc;
  border: 1px solid #666;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
}

.nav-btn:hover { background: #444; color: #fff; }

/* ── Hamburger (hidden on desktop) ── */
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 14px 11px;
  margin-left: auto;
  flex-shrink: 0;
  touch-action: manipulation;
}

.hamburger span {
  display: block;
  width: 22px;
  height: 2px;
  background: #fff;
  border-radius: 2px;
}

/* ── Mobile ── */
@media (max-width: 639px) {
  .hamburger {
    display: flex;
  }

  .nav-links {
    display: none;
    position: absolute;
    top: 48px;
    left: 0;
    right: 0;
    margin-left: 0;
    background: #333;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.75rem 1.25rem 1rem;
    gap: 0.75rem;
    z-index: 1000;
    border-top: 1px solid #444;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }

  .nav-links.open {
    display: flex;
  }

  .nav-user {
    max-width: 100%;
  }

  .nav-cta {
    align-self: flex-start;
  }
}
</style>
