# Epic 1: Intelligent Ride Pooling

## Overview
This epic focuses on enabling efficient ride-sharing by matching users with similar routes and time preferences. The goal is to maximize vehicle occupancy, reduce individual travel costs, and decrease traffic congestion.

## Implemented Features (Sprint 1)

### 1. Ride Matching Core logic
- **Pickup & Drop-off Selection**: Users can input precise locations via the planning interface.
- **Route Similarity Algorithm**: Basic logic to identify overlapping routes for potential pooling.
- **Confirmation Flow**: Users are presented with matched riders and can confirm or decline pooling requests.

### 2. Flexible Scheduling
- **Time Window Selection**: Riders can specify a pickup window (e.g., "Ready between 5:00 PM - 5:15 PM").
- **Algorithm Adjustment**: Matching logic accounts for flexible windows to increase pool success rates.
- **Slot Confirmation**: Users receive a specific pickup time within their chosen window after matching.

### 3. Pooling Transparency & Control
- **Occupancy Indicators**: Visual indicators showing current vehicle occupancy.
- **Real-time Passenger Count**: Dynamic updates as co-riders join or leave.
- **Opt-out Option**: Riders can choose to book a private ride if no suitable pool is found or if they prefer privacy.

## Technical Architecure

### Frontend Components
- `PlanRideScreen.tsx`: Handles location input and time window selection.
- `ActiveRideScreen.tsx`: Displays current ride status, co-rider info, and occupancy.
- `RideDetails.tsx` (Component): Shows matched rider lists and savings comparisons.

### Backend Services
- **Matching Engine**: Logic within `RideController` to query active ride requests within geospatial proximity and compatible time windows.
- **Ride Model**: Extended to support `pool_group_id`, `occupancy_status`, and `route_waypoints`.

## Pending / Future Improvements
- **Advanced Clustering**: Enhancing the matching algorithm with machine learning to predict clusters (moving towards Epic 4 integration).
- **Dynamic Pricing**: Real-time cost adjustments based on pool density.
- **Safety Preferences**: Filtering matches based on gender or other safety criteria (Epic 5 overlap).

## User Stories Status
- [x] **1.1 Match users with similar directions** (Implemented Basic Matching)
- [x] **1.2 Flexible pickup time windows** (Implemented Time Range Selector)
- [x] **1.3 Occupancy indicator** (Implemented in Active Ride UI)
- [x] **1.4 Compare savings** (Implemented Price Comparison UI)
- [x] **1.5 Opt-out capability** (Implemented Toggle)
- [ ] **1.6 Safety preference filtering** (Pending strict filter logic)
- [ ] **1.7 Automated request clustering** (Pending advanced algorithm)
