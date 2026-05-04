# WasteWatch Olongapo Rebuild

Clean modular rebuild of the WasteWatch Olongapo web app.

## Files

- `index.html` - app shell and screens
- `src/styles.css` - all visual styles
- `src/app.js` - UI state, role flows, reports, broadcasts, demo mode
- `src/map-view.js` - Leaflet map and boundary rendering
- `src/geofence.js` - official GeoJSON loading and point-in-polygon geofence
- `src/data.js` - barangay order, truck routes, statuses, passwords
- `src/firebase-service.js` - Firebase Realtime Database wrapper
- `src/firebase-config.js` - paste the new Firebase web config here
- `data/olongapo-barangays.geojson` - PSA GeoRisk Olongapo barangay boundaries
- `assets/wastewatch-logo.svg` - logo asset

## Firebase

Paste the new Firebase web app config into `src/firebase-config.js`.
The landing page never shows setup instructions or key warnings. If config is empty,
the app stays usable in demo mode.

Realtime Database paths used:

- `barangayStatuses/{barangayId}`
- `trucks/{truckId}`
- `reports/{pushId}`
- `activity/{pushId}`
- `alerts/{pushId}`

For school-demo testing, Firebase Realtime Database rules can be:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## Local Run

Serve the folder with any static web server, then open the local URL.

```powershell
cd WasteWatch-Rebuild
python -m http.server 4173
```

Then open `http://localhost:4173`.
