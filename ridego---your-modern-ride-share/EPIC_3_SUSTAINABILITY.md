# Epic 3: Sustainability and Carbon Awareness

## Overview
This epic aims to motivate users to make eco-conscious travel choices by visualizing their carbon footprint. By quantifying emissions and providing eco-friendly incentives, LeafLift encourages sustainable commuting.

## Implemented Features (Sprint 1)

### 1. Carbon Footprint Visualization
- **Trip Emission Display**: Showing estimated CO2 emissions for each ride option directly on the selection screen.
- **Comparison Feature**: Highlighting the difference in emissions between a standard solo ride vs. a pooled ride.

### 2. Gamified Sustainability Tracking
- **Eco-Badges**: Visual tags identifying vehicles or routes with superior emission ratings.
- **User Dashboard**: A dedicated section (`SustainabilityDashboard.tsx`) showing cumulative CO2 savings over time.
- **Impact Trends**: Graphs illustrating weekly or monthly contributions to carbon reduction.

### 3. Eco-Driving Incentives (Initial Phase)
- **Data Collection**: Logging basic acceleration and braking patterns (future input for eco-scores).
- **Green Route Selection**: Marking routes with fewer stops/starts as "Eco-Friendly".

## Technical Architecture

### Frontend Components
- `SustainabilityDashboard.tsx` (Admin/User): Displays graphs and history of savings.
- `PlanRideScreen.tsx`: Shows CO2 comparisons next to prices.
- `RideHistory.tsx`: Lists past rides with associated emission data.

### Backend Services
- **Emission Calculator**: Service implementing formulas based on distance, vehicle type, and estimated fuel consumption.
- **Analytics Service**: Aggregates user data to calculate total savings.

## Pending / Future Improvements
- **Integration with Carbon Offset Programs**: Allowing users to directly offset their emissions.
- **Advanced Driver Telemetry**: More detailed tracking of driving efficiency (coasting, gentle acceleration).
- **Community Challenges**: Ranking users by their eco-friendliness.

## User Stories Status
- [x] **3.1 Display carbon footprint** (Implemented in Ride Selection)
- [x] **3.2 Compare solo vs. pooled emissions** (Implemented in Comparison View)
- [x] **3.3 Track CO2 savings** (Implemented User History)
- [x] **3.4 Calculate emissions from telemetry** (Implemented Basic Formula)
- [x] **3.5 Highlight eco-friendly rides** (Implemented UI Badges)
- [ ] **3.6 Eco-driving insights for drivers** (Pending advanced sensors)
- [ ] **3.7 Visual sustainability metrics** (Pending detailed charting library integration)

> *Last Updated: Sprint 1 Review*

