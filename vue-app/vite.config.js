import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/lfm': {
        target: 'https://www.last.fm',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/lfm/, ''),
      },
      // MusicBrainz API
      '/mb': {
        target: 'https://musicbrainz.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/mb/, ''),
      },
      // Cover Art Archive
      '/caa': {
        target: 'https://coverartarchive.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/caa/, ''),
      },
      // Apple iTunes Search
      '/itunes': {
        target: 'https://itunes.apple.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/itunes/, ''),
      },
    },
  },
})
