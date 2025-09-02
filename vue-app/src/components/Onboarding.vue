<template>
  <div class="ob-wrap">
    <div class="ob-card glass">
      <h2 class="ob-title">Enter a window into your music</h2>
      <form class="ob-form" @submit.prevent="saveSettings">
        <input id="username" aria-label="Last.fm Username" class="ob-input" v-model="localUsername" placeholder="Last.fm Username" required />
        <input id="apiKey" aria-label="Last.fm API Key" class="ob-input" v-model="localApiKey" placeholder="Api Key" />
        <p class="ob-hint">
          To get full album information, you'll need a Last.fm API key.<br/>
          You can get one for free at the <a href="https://www.last.fm/api/account/create" target="_blank">Last.fm API site</a>.
        </p>
        <button type="submit" class="ob-cta">Get Started</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const localUsername = ref('');
const localApiKey = ref('');

const saveSettings = () => {
  if (localUsername.value.trim()) {
    localStorage.setItem('username', localUsername.value.trim());
    if (localApiKey.value.trim()) {
      localStorage.setItem('apiKey', localApiKey.value.trim());
    }
    window.location.reload();
  }
};

onMounted(() => {
  const u = localStorage.getItem('username');
  const k = localStorage.getItem('apiKey');
  if (u) localUsername.value = u;
  if (k) localApiKey.value = k;
});
</script>

<style scoped>
.ob-wrap {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  padding: 24px;
}

.glass {
  background: rgba(20,20,20,0.75);
  backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.08);
}

.ob-card {
  width: 100%;
  max-width: 520px;
  border-radius: 20px;
  padding: 36px 32px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0,0,0,0.45);
}

.ob-title {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 6px 0 22px;
}

.ob-form { display: grid; gap: 14px; }

.ob-input {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
  color: #fff;
  padding: 0 18px;
  outline: none;
  transition: border-color .2s, background .2s;
}
.ob-input::placeholder { color: #bfbfbf; opacity: .8 }
.ob-input:focus {
  border-color: var(--accent-color, #ffffff);
  background: rgba(255,255,255,0.1);
}

.ob-hint {
  margin: 6px 4px 10px;
  font-size: .9rem;
  color: #a8a8a8;
}
.ob-hint a { color: #cfcfff; text-decoration: underline; }

.ob-cta {
  margin-top: 8px;
  height: 50px;
  border: none;
  border-radius: 999px;
  padding: 0 28px;
  background: #fff;
  color: #222;
  font-weight: 700;
  letter-spacing: .2px;
  cursor: pointer;
  box-shadow: 0 8px 30px rgba(0,0,0,.25);
}
.ob-cta:hover { filter: brightness(0.98); }
.ob-cta:active { transform: translateY(1px); }
</style>
