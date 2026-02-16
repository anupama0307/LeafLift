# EPIC 5 — Safety & Trust · Test Suite

## Overview
Independent test folder validating all safety, identity-verification, and trust features in LeafLift.

## User Stories & Implementation Status

| # | User Story | Status |
|---|-----------|--------|
| 5.1 | Location & Privacy Security | ✅ PARTIAL — Contact masking, OTP verified on ride |
| 5.2 | Live Location Sharing | ✅ IMPLEMENTED — User toggle, geolocation watchPosition |
| 5.3 | SOS / Emergency Button | ✅ IMPLEMENTED — SOS calls 112, trusted contact alerts |
| 5.4 | Identity Verification | ✅ IMPLEMENTED — Email OTP, driver license/aadhar docs |
| 5.5 | Gender-Based Safety | ⚠️ PARTIAL — womenOnly checkbox UI, no backend enforcement |
| 5.6 | Accessibility Options | ⚠️ PARTIAL — Dark mode, language, distance units (UI only) |
| 5.7 | Role-Based Access (RBAC) | ✅ IMPLEMENTED — RIDER/DRIVER roles, role-based rendering |

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Vitest | ^3.2.1 | Test runner with globals |
| mongodb-memory-server | ^10.4.0 | In-memory MongoDB for isolated tests |
| mongoose | ^9.1.5 | ODM with inline schemas |

## Running Tests

```bash
cd tests/epic5-safety-trust
npm install
npx vitest run          # Run all tests
npx vitest run --reporter=verbose  # Detailed output
```

## Test Architecture

```
epic5-safety-trust/
├── package.json          # Independent dependencies
├── vitest.config.js      # Test configuration
├── setup.js              # MongoMemoryServer + inline User/Ride schemas + safety helpers
└── tests/
    ├── 5.1-location-security.test.js     # Contact masking, OTP verification
    ├── 5.2-location-sharing.test.js      # Live sharing toggle, geolocation
    ├── 5.3-sos-emergency.test.js         # SOS button, trusted contacts
    ├── 5.4-identity-verification.test.js # Email OTP, driver docs, badges
    ├── 5.5-gender-preference.test.js     # Women-only matching
    ├── 5.6-accessibility.test.js         # Dark mode, language, units
    └── 5.7-rbac.test.js                  # Role-based access control
```

## Assertions Summary *(expected counts)*

| Test File | It Blocks | DB Tests | Unit Tests |
|-----------|-----------|----------|------------|
| 5.1 Location Security | ~8 | ✅ | ✅ |
| 5.2 Location Sharing | ~7 | — | ✅ |
| 5.3 SOS Emergency | ~7 | ✅ | ✅ |
| 5.4 Identity Verification | ~9 | ✅ | ✅ |
| 5.5 Gender Preference | ~6 | ✅ | ✅ |
| 5.6 Accessibility | ~6 | — | ✅ |
| 5.7 RBAC | ~8 | ✅ | ✅ |
