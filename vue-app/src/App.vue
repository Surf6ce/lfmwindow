<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { FastAverageColor } from 'fast-average-color'
import ColorThief from 'colorthief'
import Onboarding from './components/Onboarding.vue'

// State
const username = ref(localStorage.getItem('username') || '')
const apiKey = ref(localStorage.getItem('apiKey') || import.meta.env.VITE_LASTFM_API_KEY || '');
const isLoading = ref(false)
const error = ref('')
const current = ref(null)
const isPlaying = ref(false)
const debugMode = ref(false)
const autoRefresh = ref(localStorage.getItem('autoRefresh') !== 'false') // Default to true
const isSettingsOpen = ref(false)
const needsOnboarding = ref(!localStorage.getItem('username'))

const accentColor = ref('#ffffff') // Default accent
const backgroundColors = ref(['#1a1a1a', '#2a2a2a', '#3a3a3a', '#4a4a4a', '#5a5a5a']) // Default background colors
const borderRadius = ref(Number(localStorage.getItem('borderRadius')) || 5);
const backgroundBrightness = ref(Number(localStorage.getItem('backgroundBrightness')) || 5);
const backgroundBlur = ref(Number(localStorage.getItem('backgroundBlur')) || 80);
const artworkSize = ref(Number(localStorage.getItem('artworkSize')) || 450);
const mbOnlyArt = ref(localStorage.getItem('mbOnlyArt') ? localStorage.getItem('mbOnlyArt') === 'true' : true);

watch(borderRadius, (val) => {
  localStorage.setItem('borderRadius', val);
});

watch(backgroundBrightness, (val) => {
  localStorage.setItem('backgroundBrightness', val);
  updateBackgroundStyles();
});

watch(backgroundBlur, (val) => {
  localStorage.setItem('backgroundBlur', val);
  updateBackgroundStyles();
});

watch(mbOnlyArt, (val) => localStorage.setItem('mbOnlyArt', String(val)));
watch(artworkSize, (val) => localStorage.setItem('artworkSize', val));

// Function to update CSS variables and orb opacity based on brightness and blur
const updateBackgroundStyles = () => {
  const brightness = backgroundBrightness.value; // 0-100
  const blur = backgroundBlur.value; // 0-100

  // Set CSS blur variable
  document.documentElement.style.setProperty('--vibrancy-blur', `${blur}px`);

  // Calculate orb opacity: 0% = 0.2, 100% = 1.0
  orbOpacity.value = 0.2 + (brightness / 100) * 0.8;
};

// Orb opacity (reactive)
import { ref as vueRef } from 'vue';
const orbOpacity = vueRef(0.6);
const orbs = vueRef([]);
const ORBS_STORAGE_KEY = 'bgOrbsV1';
const ORBS_COUNT = 48; // "a ton more"

function initOrbs() {
  // Try to load persisted orbs for deterministic layout across refreshes
  try {
    const saved = JSON.parse(localStorage.getItem(ORBS_STORAGE_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) {
      orbs.value = saved;
      return;
    }
  } catch {}

  const arr = [];
  for (let i = 0; i < ORBS_COUNT; i++) {
    const size = Math.round(120 + Math.random() * 140); // 120–260px
    const top = Math.round(Math.random() * 100); // percent
    const left = Math.round(Math.random() * 100); // percent
    const colorIndex = i; // will map to palette via modulo
    arr.push({ size, top, left, colorIndex });
  }
  orbs.value = arr;
  try { localStorage.setItem(ORBS_STORAGE_KEY, JSON.stringify(arr)); } catch {}
}

let refreshTimer = null
const fac = new FastAverageColor()
const colorThief = new ColorThief()

const defaultImage = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23374151'/%3E%3Cpath d='M150 100c27.614 0 50 22.386 50 50s-22.386 50-50 50-50-22.386-50-50 22.386-50 50-50zm0 20c-16.569 0-30 13.431-30 30s13.431 30 30 30 30-13.431 30-30-13.431-30-30-30z' fill='%23D1D5DB'/%3E%3C/svg%3E"

// Cache for MusicBrainz/Cover Art Archive lookups (both hits and misses)
const mbCache = new Map();
const appleCache = new Map();

// API bases (proxy in dev, direct in production)
const MB_BASE = import.meta.env.DEV ? '/mb' : 'https://musicbrainz.org';
const CAA_BASE = import.meta.env.DEV ? '/caa' : 'https://coverartarchive.org';
const ITUNES_BASE = import.meta.env.DEV ? '/itunes' : 'https://itunes.apple.com';

function upscaleItunesArt(url, size = 1200) {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
}

async function fetchAppleArtwork(artist, track, album) {
  try {
  const a = cleanQuery(artist);
  const t = cleanQuery(track);
  const al = cleanQuery(album);
  const key = `${a}|${t}|${al || ''}`.toLowerCase();
    if (appleCache.has(key)) return appleCache.get(key);

    const search = async (params) => {
      const q = new URLSearchParams(params).toString();
      const url = `${ITUNES_BASE}/search?${q}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.results) ? data.results : [];
    };

    // Prefer album search when album name is available
    let results = [];
    if (al && al !== '—') {
      results = await search({ term: `${a} ${al}`, media: 'music', entity: 'album', limit: 5, country: 'us' }) || [];
      const match = results.find(r => (
        (r.collectionName || '').toLowerCase().includes((al || '').toLowerCase()) &&
        (r.artistName || '').toLowerCase().includes((a || '').toLowerCase())
      ));
      if (match?.artworkUrl100) {
        const url = upscaleItunesArt(match.artworkUrl100, 1200);
        const out = { artworkUrl: url };
        appleCache.set(key, out);
        return out;
      }
    }

    // Fallback to track-based search
    results = await search({ term: `${a} ${t}`, media: 'music', entity: 'musicTrack', limit: 5, country: 'us' }) || [];
    const best = results.find(r => (
      (r.trackName || '').toLowerCase().includes((t || '').toLowerCase()) &&
      (r.artistName || '').toLowerCase().includes((a || '').toLowerCase())
    )) || results[0];

    if (best?.artworkUrl100) {
      const url = upscaleItunesArt(best.artworkUrl100, 1200);
      const out = { artworkUrl: url };
      appleCache.set(key, out);
      return out;
    }

    appleCache.set(key, null);
    return null;
  } catch (e) {
    console.error('Apple artwork fetch failed:', e);
    return null;
  }
}

function debugLog(...args) {
  if (debugMode.value) console.log('[LFMWindow Debug]', ...args)
}

// --- Color Extraction ---
function darkenHex(hex, amount = 0.25) {
  // Normalize #RGB or #RRGGBB
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('')
  const num = parseInt(h, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  r = Math.max(0, Math.min(255, Math.round(r * (1 - amount))))
  g = Math.max(0, Math.min(255, Math.round(g * (1 - amount))))
  b = Math.max(0, Math.min(255, Math.round(b * (1 - amount))))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

async function updateAccentColor(imageUrl) {
  if (!imageUrl) {
    accentColor.value = '#ffffff' // Reset to default
    backgroundColors.value = ['#1a1a1a', '#2a2a2a', '#3a3a3a', '#4a4a4a', '#5a5a5a']
    return
  }

  try {
  // Create image element for color extraction
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      try {
        // Get dominant color for accent
        const color = fac.getColor(img)
        if (color.hex) {
          accentColor.value = color.isLight ? darkenHex(color.hex, 0.3) : color.hex
          debugLog('Accent color updated:', accentColor.value)
        }
        
        // Get 5-color palette for background
        const palette = colorThief.getPalette(img, 5)
        if (palette && palette.length >= 5) {
          backgroundColors.value = palette.map(rgb => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`)
          debugLog('Background colors updated:', backgroundColors.value)
        }
        // Keep orb positions; colors will fade via CSS when palette changes
      } catch (e) {
        console.error('Color extraction failed:', e)
      }
    }
    
    img.onerror = () => {
      console.error('Failed to load image for color extraction')
    }
    
    img.src = imageUrl
  } catch (e) {
    debugLog('Could not get colors:', e)
  accentColor.value = '#ffffff'
    backgroundColors.value = ['#1a1a1a', '#2a2a2a', '#3a3a3a', '#4a4a4a', '#5a5a5a']
  // no orb regeneration here to keep layout stable
  }
}


// --- Data Fetching ---

async function fetchFromUrl(url) {
  const proxies = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];
  let lastError = null;
  for (const proxy of proxies) {
    try {
      const fullUrl = proxy + encodeURIComponent(url + `?_=${Date.now()}`);
      const res = await fetch(fullUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html.includes('last.fm')) throw new Error('Invalid response');
      return new DOMParser().parseFromString(html, 'text/html');
    } catch (err) {
      lastError = err;
      debugLog(`Proxy ${proxy} failed:`, err);
    }
  }
  throw new Error(`All proxies failed. Last error: ${lastError?.message}`);
}

function getBestFromSrcset(img) {
  const ss = img.getAttribute?.('srcset') || '';
  if (!ss) return null;
  return ss.split(',').map(s => s.trim().split(' ').at(0)).filter(Boolean).at(-1) || null;
}

function firstNonEmpty(...vals) { return vals.find(v => v && String(v).trim()) || null; }

function cleanQuery(str) {
  return String(str || '')
    // remove bracketed/angled/parenthetical contents e.g., (Remastered), [Deluxe], <Version>
    .replace(/\s*[\(\[\<][^\)\]>]*[\)\]\>]\s*/g, ' ')
    // drop common featuring markers
    .replace(/\b(feat\.|ft\.|featuring)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchMBArtwork(artist, track, album) {
  try {
  const a = cleanQuery(artist);
  const t = cleanQuery(track);
  const al = cleanQuery(album);
  const cacheKey = `${a}|${t}|${al || ''}`.toLowerCase();
    if (mbCache.has(cacheKey)) return mbCache.get(cacheKey);

    const tryCAA = async (basePath) => {
      // Prefer largest available variants; HEAD to avoid downloading image
      const sizes = ['-1200', '-1000', '-800', '-500', '-250', ''];
      for (const s of sizes) {
        const url = `${basePath}${s}`;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
          clearTimeout(t);
          if (res.ok) return url;
        } catch {}
      }
      return null;
    };

    if (al && al !== '—') {
      const q = `artist:"${a}" AND release:"${al}"`;
      const url = `${MB_BASE}/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=1`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const rgId = json['release-groups']?.[0]?.id;
        if (rgId) {
          const art = await tryCAA(`${CAA_BASE}/release-group/${rgId}/front`);
          if (art) {
            mbCache.set(cacheKey, { artworkUrl: art });
            return { artworkUrl: art };
          }
        }
      }
    }

  const recQ = `recording:"${t}" AND artist:"${a}"`;
  const recUrl = `${MB_BASE}/ws/2/recording/?query=${encodeURIComponent(recQ)}&fmt=json&limit=1&inc=releases`;
    const recRes = await fetch(recUrl, { cache: 'no-store' });
    if (recRes.ok) {
      const recJson = await recRes.json();
      const release = recJson.recordings?.[0]?.releases?.[0];
      if (release?.id) {
    const art = await tryCAA(`${CAA_BASE}/release/${release.id}/front`);
        if (art) {
          mbCache.set(cacheKey, { artworkUrl: art });
          return { artworkUrl: art };
        }
      }
    }

  // Cache the miss to avoid repeated queries for the same track
  mbCache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.error('MusicBrainz/Cover Art fetch failed:', err);
    return null;
  }
}
 
async function fetchNowPlaying(e) {
  e?.preventDefault?.();
  if (!username.value.trim()) { error.value = 'Enter a Last.fm username'; return; }

  isLoading.value = true;
  error.value = '';

  const processTrack = async (trackData) => {
    // Always try to get high-quality album art from MusicBrainz/Cover Art Archive first
  let mbUrl = null;
  let appleUrl = null;
    try {
      const mbData = await fetchMBArtwork(trackData.artist, trackData.name, trackData.album);
      mbUrl = mbData?.artworkUrl || null;
      if (mbUrl) debugLog('Using MusicBrainz/CoverArt artwork');
    } catch (e) {
      debugLog('MB artwork fetch error (non-fatal):', e);
    }

    if (!mbUrl) {
      try {
        const ap = await fetchAppleArtwork(trackData.artist, trackData.name, trackData.album);
        appleUrl = ap?.artworkUrl || null;
        if (appleUrl) debugLog('Using Apple Music artwork');
      } catch (e) {
        debugLog('Apple artwork fetch error (non-fatal):', e);
      }
    }

  const finalImage = mbUrl || appleUrl || (mbOnlyArt.value ? null : (trackData.image || null)); // optional fallback

    // Set the track only after deciding on the final artwork to avoid flicker
    current.value = {
      ...trackData,
      image: finalImage,
  artworkSource: mbUrl ? 'musicbrainz' : (appleUrl ? 'apple' : (trackData.image ? 'lastfm' : 'none')),
    };
    isPlaying.value = trackData.nowPlaying;

    await updateAccentColor(finalImage);
  };

  // API Method
  if (apiKey.value.trim()) {
    try {
      debugLog('Using Last.fm API');
      const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username.value)}&api_key=${apiKey.value.trim()}&format=json&limit=1`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.error) throw new Error(data.message);
      
      const track = data.recenttracks?.track?.[0];
      if (!track) { current.value = null; return; }

      await processTrack({
        name: track.name,
        artist: track.artist['#text'],
        album: track.album['#text'] || '—',
        nowPlaying: track['@attr']?.nowplaying === 'true',
        image: track.image?.find(i => i.size === 'extralarge')?.['#text'] || null,
        source: 'lastfm-api'
      });
    } catch (err) {
      error.value = `API Error: ${err.message}`;
      current.value = null;
    } finally {
      isLoading.value = false;
    }
    return;
  }

  // Scraping Method
  debugLog('Falling back to scraping');
  try {
    const doc = await fetchFromUrl(`https://www.last.fm/user/${encodeURIComponent(username.value)}/library`);
    const row = doc.querySelector('.chartlist-row--now-scrobbling, .chartlist-row');
    if (!row) { current.value = null; return; }

    const trackEl = row.querySelector('.chartlist-name a');
    const artistEl = row.querySelector('.chartlist-artist a');
    const albumEl = row.querySelector('.chartlist-album a');
    const imageEl = row.querySelector('.cover-art img');

    await processTrack({
      name: trackEl?.textContent.trim() || 'Unknown Track',
      artist: artistEl?.textContent.trim() || 'Unknown Artist',
      album: albumEl?.textContent.trim() || '—',
      nowPlaying: row.classList.contains('chartlist-row--now-scrobbling'),
      image: imageEl ? firstNonEmpty(getBestFromSrcset(imageEl), imageEl.src) : null,
      source: 'lastfm-scrape'
    });
  } catch (err) {
    error.value = 'Could not fetch track via scraping.';
    current.value = null;
  } finally {
    isLoading.value = false;
  }
}

watch(username, (newVal) => localStorage.setItem('username', newVal));
watch(apiKey, (newVal) => localStorage.setItem('apiKey', newVal));
watch(autoRefresh, (newVal) => localStorage.setItem('autoRefresh', newVal));
watch(borderRadius, (val) => {
  localStorage.setItem('borderRadius', val);
});

const AUTO_REFRESH_INTERVAL = 6000; // 6 seconds

let refreshInterval = null;
watch(autoRefresh, (enabled) => {
  if (enabled) {
    refreshInterval = setInterval(fetchNowPlaying, AUTO_REFRESH_INTERVAL);
  } else if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
});

onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });
onMounted(() => {
  if (username.value) fetchNowPlaying();
  if (autoRefresh.value) {
    refreshInterval = setInterval(fetchNowPlaying, AUTO_REFRESH_INTERVAL);
  }
  updateBackgroundStyles(); // Initialize background styles
  initOrbs();
});
</script>

<template>
  <!-- Animated Background -->
  <div class="animated-background">
  <div
    v-for="(o, i) in orbs"
    :key="i"
    class="color-orb"
    :style="{
  backgroundColor: backgroundColors[(o.colorIndex ?? i) % backgroundColors.length] || '#2a2a2a',
      opacity: orbOpacity,
  width: o.size + 'px',
  height: o.size + 'px',
  top: o.top + '%',
  left: o.left + '%'
    }"
  />
  </div>
  
  <Onboarding v-if="needsOnboarding" />
  <div v-else class="container compact-wrap" :style="{ '--accent-color': accentColor }">
    <!-- Settings Sidebar -->
    <div class="settings-sidebar" :class="{ 'is-open': isSettingsOpen }">
      <div class="sidebar-content">
        <div class="settings-header">
          <h3>Settings</h3>
        </div>
        
        <form @submit.prevent="fetchNowPlaying(); isSettingsOpen = false" class="settings-form">
          <div class="form-section">
            <h4 class="section-title">Account</h4>
            <div class="form-group">
              <label for="username" class="form-label">Last.fm Username</label>
              <input id="username" class="modern-input" v-model="username" placeholder="Just-Surface" />
            </div>
            <div class="form-group">
              <label for="apiKey" class="form-label">Last.fm API Key</label>
              <input id="apiKey" class="modern-input" type="password" v-model="apiKey" placeholder="••••••••••••••••••••••••••••••••" />
            </div>
          </div>

          <div class="form-section">
            <h4 class="section-title">Appearance</h4>
            <div class="form-group slider-group">
              <div class="slider-header">
                <label for="borderRadius" class="form-label">Album Art Rounding</label>
                <span class="slider-value">{{ borderRadius }}px</span>
              </div>
              <div class="ios-slider">
                <input id="borderRadius" type="range" min="0" max="32" v-model="borderRadius" class="slider-input" />
                <div class="slider-track" :style="{ width: (borderRadius / 32) * 100 + '%' }"></div>
                <div class="slider-thumb" :style="{ left: (borderRadius / 32) * 100 + '%' }"></div>
              </div>
            </div>

            <div class="form-group slider-group">
              <div class="slider-header">
                <label for="artworkSize" class="form-label">Artwork Size</label>
                <span class="slider-value">{{ artworkSize }}px</span>
              </div>
                <div class="ios-slider">
                  <input id="artworkSize" type="range" min="220" max="640" v-model.number="artworkSize" class="slider-input" />
                <div class="slider-track" :style="{ width: ((artworkSize - 220) / (640 - 220)) * 100 + '%' }"></div>
                <div class="slider-thumb" :style="{ left: ((artworkSize - 220) / (640 - 220)) * 100 + '%' }"></div>
              </div>
            </div>
            
            <div class="form-group slider-group">
              <div class="slider-header">
                <label for="backgroundBrightness" class="form-label">Background Brightness</label>
                <span class="slider-value">{{ backgroundBrightness }}%</span>
              </div>
                <div class="ios-slider">
                  <input id="backgroundBrightness" type="range" min="0" max="100" v-model.number="backgroundBrightness" class="slider-input" />
                <div class="slider-track" :style="{ width: backgroundBrightness + '%' }"></div>
                <div class="slider-thumb" :style="{ left: backgroundBrightness + '%' }"></div>
              </div>
            </div>
            
            <div class="form-group slider-group">
              <div class="slider-header">
                <label for="backgroundBlur" class="form-label">Background Blur</label>
                <span class="slider-value">{{ backgroundBlur }}px</span>
              </div>
                <div class="ios-slider">
                  <input id="backgroundBlur" type="range" min="0" max="100" v-model.number="backgroundBlur" class="slider-input" />
                <div class="slider-track" :style="{ width: backgroundBlur + '%' }"></div>
                <div class="slider-thumb" :style="{ left: backgroundBlur + '%' }"></div>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4 class="section-title">Options</h4>
            <div class="form-group toggle-group">
              <div class="toggle-item">
                <span class="toggle-label">Auto Refresh (6s)</span>
                <label class="ios-switch">
                  <input type="checkbox" v-model="autoRefresh" />
                  <span class="switch-slider"></span>
                </label>
              </div>
              <div class="toggle-item">
                <span class="toggle-label">Debug Mode</span>
                <label class="ios-switch">
                  <input type="checkbox" v-model="debugMode" />
                  <span class="switch-slider"></span>
                </label>
              </div>
              <div class="toggle-item">
                <span class="toggle-label">Only use MusicBrainz album art</span>
                <label class="ios-switch">
                  <input type="checkbox" v-model="mbOnlyArt" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <button class="modern-btn" type="submit">Save and Refresh</button>
        </form>
      </div>
      <div class="sidebar-overlay" @click="isSettingsOpen = false"></div>
    </div>

    <button class="settings-toggle" @click="isSettingsOpen = !isSettingsOpen">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2.73l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2.73l.15.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
    </button>

  <div class="compact-inner" :style="{ paddingTop: (Number(artworkSize) + 40) + 'px' }">
      <!-- Floating Artwork Layer -->
  <div v-if="current" class="artwork-floating" :style="{ width: artworkSize + 'px', height: artworkSize + 'px', borderRadius: borderRadius + 'px' }">
        <img :src="current.image || defaultImage" alt="Album art" @error="e => e.target.src = defaultImage" crossorigin="anonymous" />
      </div>
      <transition name="fade" mode="out-in">
        <div class="now-playing-card" v-if="current" :key="current.name + current.artist">
          <!-- Song Info Only (artwork is floating above) -->
          <div class="hero-info">
            <div class="row mb-1" style="gap:10px; justify-content: center;">
              <!-- Now playing pill moved to bottom fixed element -->
            </div>
            <div class="title-lg">{{ current.name }}</div>
            <div class="artist-lg">{{ current.artist }}</div>
            <div class="album-lg">{{ current.album }}</div>
          </div>
        </div>
      </transition>
      <div class="now-playing-card" v-if="!current && isLoading">
  <div class="artwork artwork-hero skeleton-art"></div>
        <div class="hero-info">
          <div class="shimmer-line" style="width:60%; margin: 0 auto 10px;"></div>
          <div class="shimmer-line" style="width:40%; margin: 0 auto 10px;"></div>
          <div class="shimmer-line" style="width:30%; margin: 0 auto;"></div>
        </div>
      </div>
      
      <div class="mt-3" v-if="error">
        <div class="glass card" style="border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.1);color:#fecaca">
          {{ error }}
        </div>
      </div>

      <div class="mt-4 glass card center" v-if="!isLoading && !current && !username">
        <div>
          <div class="subtitle">Enter a username in settings to begin.</div>
        </div>
      </div>
       <div class="mt-4 glass card center" v-else-if="!isLoading && !current && username">
        <div>
          <div class="subtitle">No recent tracks found for "{{ username }}".</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bottom Now Playing Pill -->
  <div class="bottom-pill" v-if="current">
    <div class="bottom-pill-inner bp-only-state">
      <div class="bp-state">{{ isPlaying ? 'Now Playing' : 'Recently Played' }}</div>
    </div>
  </div>
</template>

<style scoped>
.card{padding:16px}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s;
}
.fade-enter, .fade-leave-to /* .fade-leave-active in <2.1.8 */ {
  opacity: 0;
}
</style>
