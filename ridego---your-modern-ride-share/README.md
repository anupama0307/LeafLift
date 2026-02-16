# LeafLift - Sustainable Ride-Pooling Platform

Welcome to **LeafLift**, the modern ride-sharing application designed to prioritize sustainability, efficiency, and community.

## Project Overview

LeafLift is a comprehensive ride-pooling solution that goes beyond simple A-to-B transport. It integrates intelligent routing, carbon footprint tracking, and advanced demand prediction to create a smarter, greener city commute.

This repository contains the source code for the "Sprint 1" implementation of the core features outlined in our product roadmap.

## Key Epics & Features

The project is structured around 5 key Epics, each addressing a critical aspect of the platform:

1.  **[Intelligent Ride Pooling](./EPIC_1_POOLING.md)**: Matching algorithms to group riders with similar routes and flexible schedules.
2.  **[Real-Time Routing & Congestion](./EPIC_2_ROUTING.md)**: Dynamic navigation updates to avoid traffic and reduce delays.
3.  **[Sustainability & Carbon Awareness](./EPIC_3_SUSTAINABILITY.md)**: Visualizing eco-impact and gamifying green travel choices.
4.  **[Demand Prediction & Usage Analytics](./EPIC_4_DEMAND.md)**: Admin tools and ML models to forecast rider demand and optimize fleet allocation.
5.  **[Safety, Trust & Inclusivity](./EPIC_5_SAFETY.md)**: Robust user verification, emergency features, and privacy controls.

## Current Status (Sprint 1)

Most critical user stories (approx. 50%+) have been implemented, including:
-   **Core Ride Functionality**: Booking, matching, and active ride tracking.
-   **Admin Dashboard**: Basic analytics for demand and fleet management.
-   **Safety Integration**: SOS alerts and privacy settings.
-   **Sustainability UI**: Carbon emission estimates and tracking.

## Getting Started

### Prerequisites

-   **Node.js** (v18+ recommended)
-   **npm** or **yarn**

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/anupama0307/LeafLift.git
    cd LeafLift/ridego---your-modern-ride-share
    ```

2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  Set up Environment Variables:
    -   Create a `.env` file in the root based on `.env.example`.
    -   Add necessary API keys (e.g., Google Maps, Firebase, etc.).

### Running the Application

1.  Start the development server:
    ```bash
    npm run dev
    # or
    yarn dev
    ```

2.  Open your browser to `http://localhost:5173` (or the port specified in the console).

### Running Tests

We utilize standard testing frameworks (e.g., Vitest/Jest) for unit and integration tests.
```bash
npm run test
```

## Project Structure

-   `src/`: Main application source code (components, services, utils).
-   `admin/`: Admin panel implementation with dashboard components.
-   `server/`: Backend API and database models (`Ride.js`, `User.js`).
-   `components/`: Shared UI components (`PlanRideScreen`, `ActiveRideScreen`, etc.).

## Contributions

Contributions are welcome! Please follow the standard pull request workflow. Ensure all tests pass before submitting.

> *Last Updated: Sprint 1 Review*

