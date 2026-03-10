# EPIC 4: Demand Prediction and Usage Analytics

## Status: ✅ Implemented

All user stories in this epic are implemented and connected to the real-time backend on the admin dashboard.

---

## User Story 4.1 — Demand Forecasting (Admin)
> *As an admin, I want to predict ride demand so that resources can be allocated efficiently.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.1.1 | ✅ | `DemandScreen.tsx` → region selector dropdown + forecast tab |
| 4.1.2 | ✅ | `server/index.js` → `computeRegionDemandForecast()` statistical model using historical ride aggregation |
| 4.1.3 | ✅ | `DemandScreen.tsx` → Mapbox heatmap visualisation of predicted high-demand zones |

**API:** `GET /api/admin/demand/regions?hour=&day=&region=`

---

## User Story 4.2 — Automatic Peak Hour Detection (System)
> *As a system I want to identify peak hours automatically so that high-demand periods can be detected and managed.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.2.1 | ✅ | `server/index.js` → aggregates ride requests by hour-of-day |
| 4.2.2 | ✅ | Statistical threshold = mean + 1 standard deviation of ride counts |
| 4.2.3 | ✅ | `DashboardHome.tsx` → Peak bars highlighted in accent-rose on ride volume chart; `isPeak` flag returned by API |

**API:** `GET /api/admin/peak-hours` → returns `{ hour, label, rides, isPeak, threshold }`

---

## User Story 4.3 — Driver Suggestion During High Demand (System)
> *As a system I want to suggest more drivers during high-demand periods so that rider wait times are reduced.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.3.1 | ✅ | `DashboardHome.tsx` → Zone Demand Alerts panel monitors real-time zone demand vs driver count |
| 4.3.2 | ✅ | `server/index.js POST /api/admin/driver-alerts/broadcast` + Firebase push via `pushToDrivers()` bridge |
| 4.3.3 | ✅ | `HeatmapModal.tsx` → Mapbox heatmap overlays surge areas visible to admins; driver app receives push notification |

**API:** `POST /api/admin/driver-alerts/broadcast` `{ zone, message }`

---

## User Story 4.4 — Pool Success Rate Analytics (Admin)
> *As an admin I want analytics on ride pooling success rates so that I can evaluate its performance.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.4.1 | ✅ | `PoolingAnalytics.tsx` → Admin widget showing pooling success statistics |
| 4.4.2 | ✅ | `server/index.js` → computes `matched/totalPoolRequests` ratio |
| 4.4.3 | ✅ | `PoolingAnalytics.tsx` → Monthly trend chart (pooled vs solo bars + success rate gauge) |

**API:** `GET /api/admin/pooling/stats`

---

## User Story 4.5 — Vehicle Utilization Reports (Admin)
> *As an admin I want reports on average vehicle utilization so that I can assess vehicles efficiency.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.5.1 | ✅ | `FleetScreen.tsx` → Period selector (today/week/month) |
| 4.5.2 | ✅ | `server/index.js` → computes `active/total` per vehicle category |
| 4.5.3 | ✅ | `FleetScreen.tsx` → Utilization report table with CSV export |

**API:** `GET /api/admin/fleet/utilization?period=week`  
**Export:** `GET /api/admin/export/rides?format=csv&period=month`

---

## User Story 4.6 — Machine Learning from Historical Data (System)
> *As a system I want to learn from past ride data so that proper management can be done.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.6.1 | ✅ | `server/index.js` → `/api/admin/rides/patterns` aggregates ride logs |
| 4.6.2 | ✅ | `server/index.js` → `/api/admin/ml/bottlenecks` trains bottleneck detectors (cancellation, pool, imbalance, peak shortage) |
| 4.6.3 | ✅ | `MLInsightsPanel.tsx` → Fleet insights applied; `DashboardHome.tsx` shows quick actions for resource reallocation |

**APIs:** `GET /api/admin/rides/patterns`, `GET /api/admin/ml/bottlenecks`, `GET /api/admin/ml/fleet-insights`

---

## User Story 4.7 — Sustainability Impact Analytics (Admin)
> *As an admin I want sustainability impact analytics so that I can quantify our environmental footprint.*

| Sub-task | Status | Implementation |
|---|---|---|
| 4.7.1 | ✅ | `SustainabilityDashboard.tsx` → Admin dashboard view for environmental stats |
| 4.7.2 | ✅ | `server/index.js` → aggregate `co2Saved` and `co2Emissions` across all ride documents |
| 4.7.3 | ✅ | `SustainabilityDashboard.tsx` → Monthly CO2 saved/emitted dual-bar chart + sustainability score gauge |

**API:** `GET /api/admin/eco/stats`

---

## Real-Time Architecture

- **Socket.io** (port 5002) emits `stats-update`, `eco-update`, `driver-alert`, `demand-update`, `admin:broadcast` 
- **DashboardHome** subscribes to `stats-update` for live driver count, ongoing rides, revenue
- **SustainabilityDashboard** subscribes to `eco-update`
- **Demand alerts** broadcast to drivers via Node → Firebase bridge (`pushToDrivers()`)
- **Redis** caches API responses (60–600s TTL) to reduce DB load

## Map Provider

- **Mapbox GL JS v2** with style `mapbox://styles/mapbox/dark-v11`
- Native GPU-accelerated **heatmap layers** for rider and driver density
- **Circle layers** for regional hub markers with popup details
