# LFMWindow (Vue)

A simple, centered “Now Playing” display for Last.fm built with Vue 3 + Vite.

- Enter a Last.fm username
- Shows Now Playing/Recently Played with album art
- Uses a CORS-safe scraping fallback (AllOrigins) for quick demos

## Quick start

```powershell
Set-Location -LiteralPath 'c:\Users\Jay\lfmwindow\vue-app'
npm i
npm run dev
```

App will be available at http://localhost:5173/

## Notes
- For production, consider using the Last.fm API through a tiny proxy instead of scraping.
- Branding: LFMWindow everywhere (package name, page title, UI heading).

## License
MIT