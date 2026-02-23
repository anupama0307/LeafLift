# LeafLift Admin Console

The **LeafLift Admin Console** is a comprehensive, real-time dashboard for managing the ride-sharing platform. It provides deep insights into fleet operations, demand forecasting, sustainability metrics, and driver management.

## 📂 Directory Structure

```graphql
admin/
├── components/                 # UI Components for each screen
│   ├── DashboardHome.tsx       # Main overview dashboard
│   ├── DemandScreen.tsx        # Demand analytics & heatmap
│   ├── FleetScreen.tsx         # Fleet visualization & utilization
│   ├── PoolingAnalytics.tsx    # Ride pooling stats & trends
│   ├── SustainabilityDashboard.tsx # CO2 & environmental impact
│   ├── NotificationsScreen.tsx # Driver communication center
│   ├── MLInsightsPanel.tsx     # AI/ML predictions widget
│   ├── Layout.tsx              # App shell (Sidebar, Dark mode)
│   └── HeatmapModal.tsx        # Modal for detailed heatmap
├── App.tsx                     # Main entry point & routing
├── types.ts                    # TypeScript interfaces & enums
├── index.tsx                   # React DOM rendering
└── vite.config.ts              # Vite build configuration
```

---

## 🚀 Screens & Features

### 1. Dashboard Overview (`DashboardHome.tsx`)
The central command center providing a high-level view of the entire system.
- **Key Metrics:** Real-time counters for Total Rides, Active Drivers, Revenue, and CO2 Saved.
- **Live Updates:** Connects via Socket.IO (`stats-update` event) to show live rider/driver counts.
- **Ride Volume Chart:** Interactive 24-hour bar chart with drill-down capability (click to zoom into 10-minute intervals).
- **Quick Actions:** One-click triggers for:
    - **Driver Alerts:** Broadcast surge notifications.
    - **Export:** Download CSV reports.
    - **Peak Config:** Adjust dynamic pricing multipliers.
    - **Seed Data:** Populate demo data for testing.
- **ML Integration:** Embeds `MLInsightsPanel` for predictive analytics.

### 2. Demand Analytics (`DemandScreen.tsx`)
Advanced geospatial analytics to identify high-demand zones.
- **Interactive Heatmap:** Uses MapLibre + OLA Maps tiles to visualize demand density with color-coded bubbles (Critical/High/Medium/Low).
- **Forecast Tab:** Displays ML-generated demand predictions per region with confidence scores.
- **Peak Hours Analysis:** 24-hour distribution chart identifying operational peaks.
- **Allocation View:** 
    - **Regional Grid:** detailed stats on rides vs. drivers per zone.
    - **Deficit Tracking:** Highlights zones with driver shortages.
    - **Alerts:** System-generated alerts for surges, weather, or shortages.

### 3. Fleet Management (`FleetScreen.tsx`)
Monitor vehicle health, utilization, and distribution.
- **Utilization View:** Visual progress bars showing usage % for each vehicle type (Bike, Auto, Car, SUV).
- **Status Breakdown:** Tracks Active, Idle, and Maintenance states.
- **Optimization Insights:** AI-generated recommendations (e.g., "Shift SUV drivers to T. Nagar").
- **Reporting:** Tabular view of fleet metrics with CSV export.

### 4. Pooling Analytics (`PoolingAnalytics.tsx`)
Dedicated dashboard for monitoring the ride-sharing efficiency.
- **Success Metrics:** Tracks matched vs. solo rides and "Pool Success Rate".
- **Visualizations:**
    - **Monthly Trend:** Stacked bar chart (Pooled vs Solo).
    - **Performance Gauge:** Circular gauge for success rate.
- **Savings:** metrics on average cost savings for riders.

### 5. Sustainability Dashboard (`SustainabilityDashboard.tsx`)
Tracks the environmental impact of the platform.
- **CO2 Metrics:** Total CO2 Saved vs. Emitted.
- **Green Rides:** Percentage of rides that are pooled or EV-based.
- **Sustainability Score:** A calculated score (0-100) assessing fleet eco-friendliness.
- **Monthly Trend:** Comparative visualization of savings over time.

### 6. Notifications Center (`NotificationsScreen.tsx`)
Communication hub for engaging with drivers.
- **Compose Mode:** Send targeted messages to individual drivers or broadcast to all.
- **Quick Templates:** Pre-built messages for common scenarios (High Demand, Weather Alert).
- **History:** Searchable log of all sent notifications with read receipts.

### 7. ML Insights Panel (`MLInsightsPanel.tsx`)
A shared widget providing predictive intelligence.
- **Demand Prediction:** Forecasts rides/hour for any selected time of day.
- **Factor Analysis:** Shows influence of Hour, Day, and Base Demand on predictions.
- **Bottleneck Detection:** Identifies operational issues (e.g., High Cancellation Rate) with severity levels.

---

## 🛠 Technical Details

- **Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite.
- **Real-time:** Socket.IO client (`socket.io-client`) listens for updates on multiple channels (`stats-update`, `demand-update`, `fleet-update`, etc.).
### System Architecture & Services

The Admin Console relies on three distinct services running in parallel:

1.  **Admin Frontend (Port 3006):**
    -   Vite + React application.
    -   Proxies API requests to the backend services.
    -   Command: `npx vite --config admin/vite.config.ts`

2.  **Admin Backend Server (Port 5002):**
    -   Node.js/Express service at `admin/server/index.js`.
    -   Handles `/api/admin/*` endpoints.
    -   Manages real-time Socket.IO connections for the dashboard.
    -   Bridges notifications to the main Rider/Driver app server (Port 5001).
    -   Command: `node admin/server/index.js`

3.  **ML Microservice (Port 8000):**
    -   Python/FastAPI service at `admin/ml_service/main.py`.
    -   Handles `/api/ml/*` endpoints for predictions and analytics.
    -   Provides:
        -   **Demand Prediction:** Random Forest Regression (sklearn).
        -   **Anomaly Detection:** Statistical analysis for peak hours.
        -   **Fleet Optimization:** Scikit-learn classification.
    -   Command: `python admin/ml_service/main.py`

### Key Technical Features

-   **Mapping:** Integrated with **OLA Maps** (via MapLibre GL).
-   **State Management:** Local React state + standard Hooks.
-   **Theming:** Full Dark Mode support via Tailwind.
-   **Live Data:** Uses Socket.IO for real-time updates, bridging events from the main app.
-   **Data Storage:** Shares the same MongoDB database as the main application.
