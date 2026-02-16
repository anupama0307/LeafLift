# EPIC 2 — Real-Time Traffic-Aware Routing

## Overview
This test suite covers EPIC 2: Real-Time Traffic-Aware Routing in LeafLift. It validates OLA Maps integration for traffic-aware directions, live ETA updates, delay notifications, route visualization, and auto-rerouting logic.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Vitest** | Unit test runner (fast, Vite-native) |
| **Node.js 18+** | Runtime environment |
| **MongoDB Memory Server** | In-memory MongoDB for isolated tests |
| **Mongoose 9.x** | ODM for Ride model |
| **Supertest** | HTTP endpoint testing |

---

## Implementation Status

### User Story 2.1 — OLA Maps Traffic-Aware Routing ✅ IMPLEMENTED
- **Files**: `server/index.js`, `src/utils/olaApi.ts`
- **Details**: `POST /api/ola/directions` forwards to OLA Directions API with `traffic_metadata=true`. Returns multiple alternative routes with distance, duration, and traffic info. Frontend `getRoute()` in olaApi.ts passes waypoints for multi-stop routes.
- **Tests**: OLA API payload construction, response parsing, route alternatives handling.

### User Story 2.2 — Live ETA Updates ✅ IMPLEMENTED
- **Files**: `server/index.js`, `components/PlanRideScreen.tsx`
- **Details**: `GET /api/rides/:rideId/live-eta` calls OLA Directions API with current driver→destination coordinates. `broadcastLiveEta()` runs every 60s for all active rides, emitting `ride:eta-update` socket events. Frontend shows live ETA badge.
- **Tests**: ETA computation, Haversine fallback, socket event structure.

### User Story 2.3 — Auto-Rerouting on Congestion 🟡 PARTIAL
- **Files**: `components/PlanRideScreen.tsx`
- **Details**: Route redraws when driver moves significantly (50m threshold). No explicit congestion-triggered re-routing — route is not automatically replaced with a faster alternative.
- **Tests**: Movement threshold detection, position update logic.

### User Story 2.4 — Visual Route Change Indicators 🟡 PARTIAL
- **Files**: `components/PlanRideScreen.tsx`
- **Details**: Route colors change by status: blue=ACCEPTED, green=IN_PROGRESS. Alternative routes displayed in different colors. No explicit "route changed" flash/animation.
- **Tests**: Route color mapping by status.

### User Story 2.5 — Live Traffic Layer Overlays ❌ NOT IMPLEMENTED
- **Details**: No traffic heat layer or congestion overlay on the map.
- **Tests**: Placeholder tests documenting expected behavior.

### User Story 2.6 — Delay / Reroute Notifications ✅ IMPLEMENTED
- **Files**: `server/index.js`, `components/PlanRideScreen.tsx`
- **Details**: `broadcastLiveEta()` compares current ETA to `originalEtaMinutes`; if delay ≥ 5 min (with 5-min cooldown via `lastDelayAlertAt`), emits `ride:delay-alert` and persists notification. Frontend shows toast.
- **Tests**: Delay detection logic, cooldown enforcement, notification creation.

### User Story 2.7 — Speed vs Sustainability Balance ❌ NOT IMPLEMENTED
- **Details**: No toggle to choose between fastest route and lowest-emission route.
- **Tests**: Placeholder tests documenting expected behavior.

---

## Running Tests

```bash
cd tests/epic2-realtime-routing
npm install
npm test
```

## Folder Structure

```
epic2-realtime-routing/
├── README.md
├── package.json
├── vitest.config.js
├── setup.js
├── tests/
│   ├── 2.1-traffic-aware-routing.test.js
│   ├── 2.2-live-eta.test.js
│   ├── 2.3-auto-rerouting.test.js
│   ├── 2.4-visual-route-changes.test.js
│   ├── 2.5-traffic-layer.test.js
│   ├── 2.6-delay-notifications.test.js
│   └── 2.7-speed-sustainability.test.js
```
