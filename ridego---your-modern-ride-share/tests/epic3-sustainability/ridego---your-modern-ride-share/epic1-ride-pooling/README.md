# EPIC 1 — Ride Pooling (Smart Ride Sharing & Matching)

## Overview
This test suite covers EPIC 1: Smart Ride Pooling & Matching features in LeafLift. It validates the ride-sharing algorithms, pool seat management, fare savings comparison, safety preferences, and matching systems.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Vitest** | Unit test runner (fast, Vite-native) |
| **Node.js 18+** | Runtime environment |
| **MongoDB Memory Server** | In-memory MongoDB for isolated tests |
| **Mongoose 9.x** | ODM for User & Ride models |
| **Supertest** | HTTP endpoint testing |

---

## Implementation Status

### User Story 1.1 — Route Matching Algorithm ✅ IMPLEMENTED
- **Files**: `server/index.js`, `components/PlanRideScreen.tsx`, `server/models/User.js`
- **Details**: Haversine-based spatial matching (5 km radius). Drivers save daily routes (`POST /api/driver/route`). Riders query `GET /api/rider/match-driver` to find drivers whose routes pass near their pickup/dropoff. Frontend renders matched drivers with invite button.
- **Tests**: Route matching distance calculations, nearby driver filtering, daily route CRUD.

### User Story 1.2 — Time Window Matching ❌ NOT IMPLEMENTED
- **Details**: No time-window or schedule-compatibility logic exists. Matching is purely spatial.
- **Tests**: Placeholder tests documenting expected behavior for future implementation.

### User Story 1.3 — Occupancy Indicator / Seat Availability ✅ IMPLEMENTED
- **Files**: `server/index.js`, `components/PlanRideScreen.tsx`, `server/models/Ride.js`
- **Details**: `GET /api/rides/pooled-in-progress` returns active pooled rides with computed `currentPassengers` and `availableSeats`. UI renders seat icons (🟢 filled / ⚪ empty).
- **Tests**: Seat count computation, available seat filtering, pooled ride queries.

### User Story 1.4 — Savings Comparison (Pool vs Solo) ✅ IMPLEMENTED
- **Files**: `components/PlanRideScreen.tsx`
- **Details**: `calculateCO2()` computes emissions per vehicle type (BIKE 20, AUTO 60, CAR 120, BIG_CAR 180, pool 40 g/km). Pool fare uses 0.67× multiplier. UI shows inline savings comparison.
- **Tests**: Fare calculation with pool discount, CO₂ emission calculations, savings display logic.

### User Story 1.5 — Opt-Out Mid-Ride 🟡 PARTIAL
- **Files**: `server/index.js`, `components/DriverDashboard.tsx`
- **Details**: Early ride termination exists (`handleRequestEarlyComplete` — partial fare based on actual distance). However, no specific "leave pool" mechanism for individual riders in a shared ride.
- **Tests**: Early termination fare calculation, partial distance computation.

### User Story 1.6 — Safety Preferences for Pooling 🟡 PARTIAL
- **Files**: `components/PlanRideScreen.tsx`
- **Details**: UI has checkboxes: womenOnly, verifiedOnly, noSmoking — sent as `safetyPreferences` in ride creation. Backend does NOT filter pool matches by these preferences (stored but unenforced).
- **Tests**: Safety preference payload validation, preference storage.

### User Story 1.7 — Auto-Clustering Pickup Points 🟡 PARTIAL
- **Files**: `server/index.js`
- **Details**: `GET /api/drivers/nearby` clusters nearby drivers using Haversine grouping. However, no pickup point clustering for riders.
- **Tests**: Nearby driver clustering, Haversine distance helper.

---

## Running Tests

```bash
cd tests/epic1-ride-pooling
npm install
npm test
```

## Folder Structure

```
epic1-ride-pooling/
├── README.md
├── package.json
├── vitest.config.js
├── setup.js
├── tests/
│   ├── 1.1-route-matching.test.js
│   ├── 1.2-time-window.test.js
│   ├── 1.3-occupancy-indicator.test.js
│   ├── 1.4-savings-comparison.test.js
│   ├── 1.5-opt-out-midride.test.js
│   ├── 1.6-safety-preferences.test.js
│   └── 1.7-auto-clustering.test.js
```
