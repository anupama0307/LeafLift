# Epic 4: Demand Prediction and Usage Analytics

## Overview
This epic focuses on utilizing historical data and real-time trends to optimize fleet operations and predict future demand. By analyzing key metrics, LeafLift can proactively allocate drivers and reduce wait times.

## Implemented Features (Sprint 1)

### 1. Demand Zone Management
- **Heatmap Visualization**: An interactive map interface highlighting high-demand zones (`HeatmapModal.tsx`) within `admin/components`.
- **Region Filtering**: Admin capability to view demand across different geographical regions.

### 2. Basic Predictive Models
- **Historical Analysis**: Aggregating past ride request data to identify consistent peaks.
- **Time-Based Trends**: Highlighting predictable surges (e.g., commute hours).

### 3. Driver Allocation Optimization
- **Availability Insights**: Overlaying active driver positions against high-demand zones.
- **Basic Dispatch Logic**: Ensuring sufficient coverage in expected busy areas.

## Technical Architecture

### Frontend Components
- `DemandScreen.tsx` (Admin): Main interface for viewing prediction data.
- `PoolingAnalytics.tsx` (Admin): Tracks pooling success rates and savings.
- `HeatmapModal.tsx`: Visualizes spatial demand density.

### Backend Services
- **Data Aggregator**: Collects and normalizes ride request logs for analysis.
- **Prediction Engine (ML)**: Initial machine learning models (potentially in Python/external service or `ml_service`) processing historical patterns.
- **Fleet Utilization Service**: Monitors active vehicle percentages.

## Pending / Future Improvements
- **Live Event Integration**: Correlating demand spikes with local events/holidays.
- **Weather Impact Analysis**: Adjusting predictions based on forecast data.
- **Automated Driver Incentives**: Offering bonuses for logging in during predicted high-demand times.

## User Stories Status
- [x] **4.1 Predict ride demand** (Implemented Basic Forecasting)
- [x] **4.2 Identify peak hours** (Implemented Statistical Analysis)
- [ ] **4.3 Suggest more drivers during peaks** (Pending Push Notification System)
- [x] **4.4 Pooling success analytics** (Implemented Admin Dashboard)
- [x] **4.5 Vehicle utilization reports** (Implemented Admin Reporting)
- [x] **4.6 Learn from past ride data** (Implemented Historical Logs)
- [ ] **4.7 Sustainability impact analytics** (Partially implemented in Epic 3 dashboard)

> *Last Updated: Sprint 1 Review*

