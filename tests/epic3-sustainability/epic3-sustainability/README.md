# EPIC 3 — Sustainability Dashboard

## Overview
This test suite covers EPIC 3: Sustainability Dashboard features in LeafLift. It validates CO₂ emission calculations, personal carbon tracking, eco-metrics display, emissions comparison, and gamification concepts.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **Vitest** | Unit test runner (fast, Vite-native) |
| **Node.js 18+** | Runtime environment |
| **MongoDB Memory Server** | In-memory MongoDB for isolated tests |
| **Mongoose 9.x** | ODM for User & Ride models |

---

## Implementation Status

### User Story 3.1 — CO₂ Footprint Display Per Ride ✅ IMPLEMENTED
- **Files**: `components/PlanRideScreen.tsx`, `server/models/Ride.js`, `server/index.js`
- **Details**: `calculateCO2(distanceKm, vehicleCategory, isPooled)` with rates: BIKE 20, AUTO 60, CAR 120, BIG_CAR 180 g/km. Pooled rides calculated at 40 g/km. Both `co2Emissions` and `co2Saved` stored per ride. On completion, totals aggregated on user record.
- **Tests**: CO₂ calculations for all vehicle types, pooled vs solo comparison, storage validation.

### User Story 3.2 — Emissions Comparison Modal 🟡 PARTIAL
- **Files**: `components/PlanRideScreen.tsx`
- **Details**: Inline comparison shown during ride planning: "Save ₹X & Y g CO₂ vs solo". However, no dedicated modal with breakdown across transport modes.
- **Tests**: Inline savings computation, comparison data structure.

### User Story 3.3 — Personal Carbon Savings Tracker ✅ IMPLEMENTED
- **Files**: `server/models/User.js`, `components/AccountScreen.tsx`, `components/HomeScreen.tsx`
- **Details**: User model stores `totalCO2Saved`, `totalCO2Emitted`, `totalTrips`, `totalKmTraveled`. AccountScreen renders stat cards. HomeScreen shows carbon widget. `GET /api/users/:id/stats` returns aggregated eco stats.
- **Tests**: User eco stats storage, aggregation from rides, stats endpoint data.

### User Story 3.4 — Telemetry-Based CO₂ Calculation 🟡 PARTIAL
- **Files**: `components/PlanRideScreen.tsx`
- **Details**: Uses `distance × rate` per vehicle type. NOT true telemetry — no real-time speed, acceleration, idle time, or engine data.
- **Tests**: Distance-based calculation accuracy, notes on missing telemetry.

### User Story 3.5 — Eco-Badges / Gamification ❌ NOT IMPLEMENTED
- **Details**: No badge system, achievements, leaderboard, or gamification elements exist.
- **Tests**: Placeholder tests documenting expected badge/achievement system.

### User Story 3.6 — Eco-Driving Score / Insights 🟡 PARTIAL
- **Files**: `components/AccountScreen.tsx`
- **Details**: "Eco-Driving Insights" menu entry exists as UI placeholder. No scoring algorithm or driving behavior analysis.
- **Tests**: Placeholder tests documenting expected scoring system.

### User Story 3.7 — Visual Sustainability Metrics ✅ IMPLEMENTED
- **Files**: `components/AccountScreen.tsx`, `components/HomeScreen.tsx`, `admin/components/SustainabilityDashboard.tsx`
- **Details**: Rider sees stat cards (CO₂ saved/emitted/trips/km). HomeScreen has carbon widget. Admin has full dashboard with monthly CO₂ trend, net reduction %, environmental score.
- **Tests**: Stat card data structure, trees-equivalent calculation, metric formatting.

---

## Running Tests

```bash
cd tests/epic3-sustainability
npm install
npm test
```

## Folder Structure

```
epic3-sustainability/
├── README.md
├── package.json
├── vitest.config.js
├── setup.js
├── tests/
│   ├── 3.1-co2-per-ride.test.js
│   ├── 3.2-emissions-comparison.test.js
│   ├── 3.3-carbon-tracker.test.js
│   ├── 3.4-telemetry-calculation.test.js
│   ├── 3.5-eco-badges.test.js
│   ├── 3.6-eco-driving-score.test.js
│   └── 3.7-visual-metrics.test.js
```
