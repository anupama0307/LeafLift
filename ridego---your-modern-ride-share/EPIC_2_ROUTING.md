# Epic 2: Real-Time Routing and Congestion

## Overview
This epic focuses on minimizing travel time and environmental impact through intelligent routing that bypasses traffic congestion. It leverages real-time data to provide accurate updates and smoother navigation experiences for users.

## Implemented Features (Sprint 1)

### 1. Dynamic Route Calculation
- **Real-time Traffic Integration**: Placeholder integration with external traffic APIs (e.g., Google Maps Traffic Layer).
- **Alternative Routes**: Suggesting paths based on current traffic density.
- **Congestion Alerts**: Pushing notifications for significant delays.

### 2. ETA Updates
- **Live Tracking**: Continuous recalculation of estimated arrival times based on speed and location.
- **Visual Feedback**: Map overlays highlighting congested zones (red/yellow lines).
- **Notification System**: Users receive alerts if their ride gets delayed significantly.

### 3. Smart Re-routing
- **Auto-Reroute**: System automatically checks for faster alternatives if delays exceed a preset threshold.
- **User Choice**: Riders are often presented with the option to confirm a route change if multiple viable paths exist.
- **Sustainability Flag**: Highlighting routes that are greener due to less idling time.

## Technical Architecture

### Frontend Components
- `Maps.tsx` (Likely integrated): Handles map rendering and route visualization.
- `ActiveRideScreen.tsx`: Displays current route, ETA, and alerts for changes.
- `NotificationToast.tsx`: Displays route update messages.

### Backend Services
- **Routing Engine**: Calculates distances and durations using API calls.
- **Traffic Monitor**: Background service monitoring active rides for significant deviations from predicted ETAs.

## Pending / Future Improvements
- **Predictive Traffic Modeling**: Using historical data to anticipate congestion before it happens.
- **Advanced Emission Calculation**: More precise CO2 calculations based on variable speeds and waiting times (Epic 3 overlap).
- **Driver Gamification**: Incentivize drivers to pick efficient routes (Epic 3).

## User Stories Status
- [x] **2.1 Avoid congested roads** (Implemented Basic Routing)
- [x] **2.2 Real-time ETA updates** (Implemented Dynamic Display)
- [x] **2.3 Reroute based on traffic** (Implemented Auto-Switch Logic)
- [x] **2.4 Visualize route changes** (Implemented Map Updates)
- [ ] **2.5 Use live traffic data** (Pending full API integration)
- [ ] **2.6 Notify delays** (Pending push notification service)
- [ ] **2.7 Optimize for speed & sustainability** (Pending complex weighting algorithm)

> *Last Updated: Sprint 1 Review*

