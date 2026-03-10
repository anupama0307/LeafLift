# Epic 5: Safety, Trust and Inclusivity

## Overview
This epic aims to build user trust and prioritize safety as a core platform value. By offering verified profiles, customizable safety settings, and emergency features, LeafLift ensures a secure and inclusive experience for all members.

## User Stories & Status

- [x] User Story 5.1: As a user I want my location data to be securely stored so that my privacy and safety are protected. (Implemented)
    - [x] 5.1.1 Encrypt sensitive location coordinates. (AES-256 at rest)
    - [x] 5.1.2 Implement strict access controls for database location logs. (RBAC Middlewares + JWT)
    - [x] 5.1.3 Configure automated deletion policy for expired location data. (30-day auto-scrubbing)

- [x] User Story 5.2: As a user I want to control when my live location is shared so that I can protect my privacy and feel safe using the system. (Implemented)
    - [x] 5.2.1 Add toggle switch to privacy settings menu. (Account -> Safety & Privacy)
    - [x] 5.2.2 Stop transmitting GPS coordinates when sharing is disabled. (Logic in Driver/Rider maps)
    - [x] 5.2.3 Display visual indicator of current location sharing status. (Live / Sharing Off badge in Layout)

- [x] User Story 5.3: As a rider I want an SOS feature for emergencies during rides so that I can get immediate help when I feel unsafe or face an emergency. (Implemented)
    - [x] 5.3.1 Place a prominent SOS button on the active ride interface. (Added to PlanRideScreen & ActiveRideScreen)
    - [x] 5.3.2 Transmit distress signal to backend safety monitoring system. (SafetyAlerts database logs)
    - [x] 5.3.3 Send SMS with live location to emergency contacts. (Alerts dispatched to Trusted Contacts)

- [ ] User Story 5.4: As a user I want to see verified driver/rider profiles so that I can feel more comfortable sharing a ride with strangers. (Pending)
    - [ ] 5.4.1 Display verification badge on processed profiles.
    - [ ] 5.4.2 Show profile photo and rating before ride acceptance.
    - [ ] 5.4.3 Allow users to view detailed safety reviews.

## Technical Components
- `User.js`: Schema includes `privacySettings`, `trustedContacts`, and encryption for location fields.
- `SafetyAlert.js`: New schema for tracking emergency SOS triggers.
- `AccountScreen.tsx`: Interface for managing privacy toggles and trusted contacts.
- `ActiveRideScreen.tsx` / `PlanRideScreen.tsx`: SOS button and real-time alerts.
- `server/index.js`: Background tasks for scrubbing data and SOS handling.
