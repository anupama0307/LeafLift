# Epic 5: Safety, Trust and Inclusivity

## Overview
This epic aims to build user trust and prioritize safety as a core platform value. By offering verified profiles, customizable safety settings, and emergency features, LeafLift ensures a secure and inclusive experience for all riders.

## Implemented Features (Sprint 1)

### 1. User Verification & Privacy
- **Secure Authentication**: Robust log-in and account recovery using JWT.
- **Profile Verification**: ID upload for status badges.
- **Location Privacy**: Encryption of coordinates and sharing controls.

### 2. Emergency Safety
- **SOS Functionality**: Active SOS alerts on the ride interface.
- **Real-time Tracking**: Secure transmission of location data.

### 3. Inclusivity & Preferences
- **Gender Filtering**: Same-gender pooling requests.
- **Accessibility Options**: Wheelchair-accessible vehicle filters.
- **Driver Info**: Detailed driver profiles and ratings.

## Technical Architecture

### Frontend Components
- `AuthScreen.tsx`: Handles user login/signup and verification flows.
- `AccountScreen.tsx`: Manages user profile settings, including privacy toggles.
- `ActiveRideScreen.tsx`: Includes the SOS button and safety toolkit.

### Backend Services
- **Identity Service**: JWT-based authentication and role-based access control.
- **Privacy Service**: AES-256-CBC encryption for location data and scheduled scrubbing.
- **Ride Controller**: Filters match requests based on safety parameters.

## User Stories Status
- [x] **User Story 5.1: Secure Location Data Storage** (Implemented)
    - [x] 5.1.1 Encrypt sensitive location coordinates (AES-256-CBC).
    - [x] 5.1.2 Strict access controls via JWT middleware.
    - [x] 5.1.3 Automated deletion policy for expired data (30-day retention).
- [x] **User Story 5.2: Live Location Sharing Control** (Implemented)
    - [x] 5.2.1 Add toggle switch to privacy settings menu.
    - [x] 5.2.2 Stop transmitting GPS coordinates when sharing is disabled.
    - [x] 5.2.3 Display visual indicator of current location sharing status.
- [x] **User Story 5.4: User/Driver Identification** (Implemented)
    - [x] Document upload and verification badge system.
- [x] **User Story 5.5: Gender-preference Pooling** (Implemented)
- [x] **User Story 5.6: Accessibility-friendly Options** (Implemented)
- [x] **User Story 5.7: Role-based Access Control** (Implemented via JWT)

> *Last Updated: March 2024*
