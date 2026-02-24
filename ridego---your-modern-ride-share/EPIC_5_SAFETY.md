# Epic 5: Safety, Trust and Inclusivity

## Overview
This epic aims to build user trust and prioritize safety as a core platform value. By offering verified profiles, customizable safety settings, and emergency features, LeafLift ensures a secure and inclusive experience for all riders.

## Implemented Features (Sprint 1)

### 1. User Verification & Privacy
- **Secure Authentication**: Robust log-in and account recovery.
- **Profile Verification**: Option to upload ID documents for status badges (`AccountScreen.tsx` related).
- **Location Privacy**: A simple toggle to stop sharing live location when not in an active ride.

### 2. Emergency Safety
- **SOS Functionality**: A prominent button on the ride interface to quickly alert contacts or authorities (`ActiveRideScreen.tsx`).
- **Real-time Tracking**: Sharing ride details with trusted contacts.

### 3. Inclusivity & Preferences
- **Gender Filtering**: Allowing riders to request same-gender pooling for comfort.
- **Accessibility Options**: Filtering for wheelchair-accessible vehicles.
- **Driver Info**: Showing driver ratings and vehicle details explicitly before booking.

## Technical Architecture

### Frontend Components
- `AuthScreen.tsx`: Handles user login/signup and verification flows.
- `AccountScreen.tsx`: Manages user profile settings, including privacy toggles.
- `ActiveRideScreen.tsx`: Includes the SOS button and safety toolkit.

### Backend Services
- **Identity Service**: Manages verification statuses and document storage (securely).
- **Ride Controller**: Filters match requests based on safety parameters (gender, accessibility).
- **Notification Service**: Handles SOS alerts and contact notifications.

## Pending / Future Improvements
- **Advanced Background Checks**: Integration with third-party verification APIs.
- **Audio Recording**: Option to record ride audio for safety disputes.
- **AI-Driven Anomaly Detection**: Flagging unusual route deviations automatically.

## User Stories Status
- [ ] **5.1 Secure location storage** (Pending data encryption layer)
- [x] **5.2 Control live location sharing** (Implemented Privacy Toggle)
- [x] **5.3 SOS feature for emergencies** (Implemented Button & Alert Logic)
- [x] **5.4 Driver/rider verification** (Implemented Basic ID Upload)
- [x] **5.5 Gender-preference pooling** (Implemented Filter UI)
- [x] **5.6 Accessibility-friendly options** (Implemented Filter Checkbox)
- [ ] **5.7 Role-based access control** (Pending comprehensive RBAC)

> *Last Updated: Sprint 1 Review* - Current Status (Ongoing work for Sprint 2)

