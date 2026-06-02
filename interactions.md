# Project Interactions Log

## Session: 2026-06-01

### Request 1: Create Cloudflare Pages Ham Radio Callsign Lookup

**User Request:**
- Create a Cloudflare Pages project
- Function to lookup ham radio operator addresses by callsign via QRZ.com API
- Web page with:
  - Text area for entering callsigns
  - Editable table (callsign, name, address) - new entries at top
  - Map showing callsign locations (right of table)
  - Address edits update map location
  - LocalStorage caching to avoid redundant API calls

**Status:** Complete

**Files Created:**
- `qrz-lookup/package.json` - Project configuration
- `qrz-lookup/wrangler.toml` - Cloudflare configuration
- `qrz-lookup/functions/api/lookup.js` - Cloudflare Pages Function for QRZ.com API
- `qrz-lookup/public/index.html` - Main webpage
- `qrz-lookup/public/style.css` - Styling
- `qrz-lookup/public/app.js` - Frontend JavaScript with localStorage caching

**Features Implemented:**
1. Cloudflare Pages Function that:
   - Receives HTTP POST with callsign
   - Authenticates with QRZ.com XML API
   - Returns name, address, and coordinates

2. Frontend with:
   - Text input for callsign entry
   - Editable table (callsign, name, address) - new entries at top
   - Leaflet map showing operator locations
   - Address edits trigger geocoding and map update
   - localStorage caching (7-day expiry) to avoid redundant API calls

**Setup Required:**
- Set `QRZ_USERNAME` and `QRZ_PASSWORD` environment variables in Cloudflare dashboard
- Run `npm install` then `npm run dev` for local development
- Run `npm run deploy` to deploy to Cloudflare Pages

---

### Request 2: Debug 404 on mc.more-radio.org

**Issue:** Site returning 404

**Findings:**
- Project `mc` exists in Cloudflare Pages
- Latest deployment: `https://b64bbad5.mc-7qn.pages.dev`
- Site is behind Cloudflare Access (auth required)
- Likely cause: Build output directory not set to `public` in Cloudflare dashboard

**Solution:**
1. Dashboard → Pages → mc → Settings → Build configuration
2. Set "Build output directory" to `public`
3. Check Access Policy if public access is needed

---
