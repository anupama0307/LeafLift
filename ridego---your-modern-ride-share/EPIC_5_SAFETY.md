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

- [x] User Story 5.4: As a user I want driver and rider verification so that I can trust the people using the platform. (Implemented)
    - [x] 5.4.1 Implement ID document upload interface during registration. (Step-by-step verification flow)
    - [x] 5.4.2 Integrate background check API to validate user identity. (Simulated background check service)
    - [x] 5.4.3 Display "Verified" badge on the user's public profile. (Dynamic badge in AccountScreen)

- [x] User Story 5.5: As a rider I want gender-preference pooling options so that I feel safe and comfortable while sharing a ride. (Implemented)
    - [x] 5.5.1 Add gender filter options to the ride request screen. (Integrated into Safety Preferences)
    - [x] 5.5.2 Update matching algorithm to respect gender constraints. (Server-side cross-preference validation)
    - [x] 5.5.3 Verify co-rider gender compatibility before confirming the ride. (Real-time gender display in match proposals)

## Technical Components
- `User.js`: Schema includes `privacySettings`, `trustedContacts`, and encryption for location fields.
- `SafetyAlert.js`: New schema for tracking emergency SOS triggers.
- `AccountScreen.tsx`: Interface for managing privacy toggles and trusted contacts.
- `ActiveRideScreen.tsx` / `PlanRideScreen.tsx`: SOS button and real-time alerts.
- `server/index.js`: Background tasks for scrubbing data and SOS handling.
