# LeafLift - Sustainable Ride-Sharing Platform

## Project Overview

LeafLift is a comprehensive ride-sharing application designed to address urban congestion and environmental impact through intelligent ride pooling and sustainability tracking. The platform connects riders with drivers using a proximity-based matching algorithm that prioritizes shared routes, significantly reducing the carbon footprint of daily commutes.

Unlike traditional ride-hailing services, LeafLift integrates gamified sustainability features, real-time demand analytics, and safety-first protocols directly into the core user experience. The system is built on a responsive, event-driven architecture that ensures seamless real-time communication between riders and drivers without page refreshes.

## Core Value Proposition

What sets LeafLift apart is its dedicated focus on "green mobility" combined with a robust technical execution of multi-rider pooling:

1.  **Proximity-Based Pool Matching**: Our proprietary matching logic identifies optimal ride pairings based on a 3km pickup and 5km dropoff radius, ensuring efficient detours and minimal delay for all passengers.
2.  **Sustainability Metrics**: Every ride calculates and displays the specific CO2 emissions saved compared to a solo trip, encouraging eco-conscious behavior through tangible data.
3.  **Resilient Session Management**: The platform features a sophisticated state recovery system that handles network interruptions, driver sessions, and ride cancellations gracefully, ensuring no user is left in a stale state.
4.  **Real-Time Data Sync**: Utilizing WebSocket technology, ride updates (acceptance, arrival, location tracking) are synchronized instantly across all connected clients.

## Technology Stack

The project utilizes a modern, MERN-stack-inspired architecture with specific enhancements for real-time capabilities and testing.

### Frontend
-   **Framework**: React (v19) with Vite
-   **Language**: TypeScript
-   **Styling**: Tailwind CSS for responsive, utility-first design
-   **Maps & Routing**: Leaflet / Ola Maps API integration
-   **State Management**: React Hooks and Context API

### Backend (Server)
-   **Runtime**: Node.js
-   **Framework**: Express.js
-   **Database**: MongoDB with Mongoose ODM
-   **Real-Time Communication**: Socket.io for bidirectional event handling
-   **Authentication**: Firebase Admin SDK & JWT

### DevOps & Tools
-   **Version Control**: Git
-   **Package Management**: npm

### Testing Frameworks
We employ a comprehensive testing strategy to ensure reliability:
-   **Unit & Integration Testing**: Vitest (for both frontend components and backend logic)
-   **End-to-End (E2E) Testing**: Playwright (for critical user flows like booking and login)
-   **API Testing**: Supertest (for backend endpoint verification)
-   **Environment**: JSDOM for frontend test simulation

## Key Features & User Stories (Epics)

The development of LeafLift was organized into five major Epics, each addressing specific user needs:

### Epic 1: Ride Pooling & Matching
-   **As a rider**, I can request a pooled ride to save money and reduce emissions.
-   **As a system**, I automatically match riders with similar routes within a 3km/5km proximity radius.
-   **As a driver**, I receive consolidated ride requests for pooled groups rather than individual bookings.
-   **As a rider**, I receive a proposal when a match is found and can accept or reject it within 60 seconds.

### Epic 2: Real-Time Routing & Tracking
-   **As a rider**, I can see the live location of my driver on a map.
-   **As a rider**, I receive accurate ETA updates based on current traffic and driver location.
-   **As a driver**, I can see the optimal route to the pickup and dropoff locations.

### Epic 3: Sustainability & Impact
-   **As a rider**, I can view the CO2 saved for each pooled ride.
-   **As a user**, I can track my cumulative "Green Points" and environmental contribution over time.
-   **As an organization**, we can monitor the total carbon reduction achieved by the platform.

### Epic 4: Demand Analytics
-   **As an admin**, I can view heatmaps of high-demand areas to optimize driver allocation.
-   **As a driver**, I am notified of surge zones where rider demand is currently highest.

### Epic 5: Safety & Trust
-   **As a rider**, I can verify the driver's identity through profile details and vehicle information.
-   **As a rider**, I have access to an SOS button for immediate emergency assistance.
-   **As a system**, we obscure phone numbers to protect user privacy while allowing communication.

## Execution Strategy

The project execution followed an agile methodology with iterative development and rigorous testing:

1.  **Architecture Design**: Established a decoupled client-server architecture. The frontend handles UI/UX and map interactions, while the backend manages business logic, database operations, and socket events.
2.  **Real-Time Implementation**: Implemented a WebSocket layer (`realtime.ts`) to handle transient state (driver location, ride status, chat messages) efficiently, reducing database load.
3.  **Proximity Logic**: Developed a geospatial query system using MongoDB and Haversine formula calculations to filter nearby drivers and match pool candidates accurately.
4.  **State Recovery**: Engineered a session restoration mechanism that allows users to refresh their browser or lose connectivity without losing their active ride state.
5.  **Quality Assurance**: Integrated `vitest` for continuous testing of core logic (matching algorithms, pricing) and `playwright` for validating complex user flows (booking a ride, driver acceptance).

## Installation & Setup

### Prerequisites
-   Node.js (v18 or higher)
-   npm (v9 or higher)
-   MongoDB Instance (Local or Atlas)

### Steps
1.  **Clone the Repository**
    ```bash
    git clone https://github.com/anupama0307/LeafLift.git
    cd LeafLift
    ```

2.  **Install Dependencies**
    Root (Frontend):
    ```bash
    npm install
    ```
    Server (Backend):
    ```bash
    cd server
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory with the following keys:
    ```
    PORT=5001
    VITE_DEV_PORT=3005
    VITE_API_BASE_URL=http://localhost:5000
    MONGODB_URI=your_mongodb_connection_string
    VITE_OLA_MAPS_API_KEY=your_ola_maps_key
    VITE_FIREBASE_API_KEY=your_firebase_key
    ... (add other Firebase config keys)
    ```

4.  **Running the Application**
    Start the Backend (from `server` directory):
    ```bash
    cd server
    npm start
    ```
    Start the Frontend (from root directory):
    ```bash
    npm run dev
    ```

5.  **Running Tests**
    To execute the test suite:
    ```bash
    npm test
    ```
