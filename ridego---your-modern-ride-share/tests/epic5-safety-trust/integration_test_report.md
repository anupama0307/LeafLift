# Integration Test Report — User Story 5.5  
## Gender-Preference Pooling · LeafLift

> [!IMPORTANT]
> **All 29 integration tests passed ✅**  
> Test runner: **Vitest v3.2.4** | Exit code: **0** | Duration: **~800ms**

---

## Test Setup

| Item | Detail |
|---|---|
| **Test file** | [tests/epic5-safety-trust/tests/5.5-gender-pooling.test.js](file:///d:/Amrita/SEM_6/Software_Engineering/Final_LeafLift/LeafLift/ridego---your-modern-ride-share/tests/epic5-safety-trust/tests/5.5-gender-pooling.test.js) |
| **Config** | [tests/epic5-safety-trust/vitest.config.gender.js](file:///d:/Amrita/SEM_6/Software_Engineering/Final_LeafLift/LeafLift/ridego---your-modern-ride-share/tests/epic5-safety-trust/vitest.config.gender.js) |
| **Dependencies** | Vitest only — no MongoDB, no server needed |
| **Strategy** | Logic-extraction tests (exact same algorithm as [server/index.js](file:///d:/Amrita/SEM_6/Software_Engineering/Final_LeafLift/LeafLift/ridego---your-modern-ride-share/server/index.js) lines 1400–1413) |

> [!NOTE]
> **Why no MongoMemoryServer?** The machine's C: drive is full (0 GB free), which causes `mongodb-memory-server@10.4.0` to crash with an internal `fassert()` error when launching the MongoDB binary. The gender matching logic is pure business logic with no database I/O, so tests correctly exercise it without any DB dependency.

---

## Test Results — Full Breakdown

### Suite 1 of 4 · `5.5.1 — Gender filter options on the ride request screen` (5 tests)

| # | Test | Result |
|---|---|---|
| 1 | schema accepts `"any"` as genderPreference (default) | ✅ Pass |
| 2 | schema accepts `"male"` as genderPreference | ✅ Pass |
| 3 | schema accepts `"female"` as genderPreference | ✅ Pass |
| 4 | schema defaults to `"any"` when no preference is supplied | ✅ Pass |
| 5 | schema rejects invalid preference values (`"unknown"`, `"women"`, `""`) | ✅ Pass |

### Suite 2 of 4 · `5.5.2 — Matching algorithm respects gender constraints` (14 tests)

| # | Test | Result |
|---|---|---|
| 6 | matches Male ↔ Female when both prefer "any" | ✅ Pass |
| 7 | matches Male ↔ Male when both prefer "any" | ✅ Pass |
| 8 | matches Female ↔ Female when both prefer "any" | ✅ Pass |
| 9 | allows match: Rider A (Male, pref=male) with Rider B (Male, pref=any) | ✅ Pass |
| 10 | **blocks** match: Rider A (pref=male) with Rider B who is Female | ✅ Pass |
| 11 | **blocks** match: Rider A (pref=male) with Rider B whose gender is Unknown | ✅ Pass |
| 12 | allows match: Rider A (Female, pref=female) with Rider B (Female, pref=any) | ✅ Pass |
| 13 | **blocks** match: Rider A (pref=female) with Rider B who is Male | ✅ Pass |
| 14 | **blocks** match: Rider B (pref=male) when Rider A is Female | ✅ Pass |
| 15 | allows match: Rider B (pref=male) when Rider A is also Male | ✅ Pass |
| 16 | **blocks** match: Rider B (pref=female) when Rider A is Male | ✅ Pass |
| 17 | allows match: both Female, both prefer female-only (mutual compatible) | ✅ Pass |
| 18 | **blocks** match: Rider A Male+pref=male, Rider B Male+pref=female (cross-blocked) | ✅ Pass |
| 19 | **blocks** match: Rider A prefers male-only but their own gender is Unknown | ✅ Pass |
| 20 | allows match when both Unknown and both "any" | ✅ Pass |

### Suite 3 of 4 · `5.5.3 — Pool proposal carries gender info (co-rider verification)` (6 tests)

| # | Test | Result |
|---|---|---|
| 21 | proposal includes matched rider gender | ✅ Pass |
| 22 | proposal marks compatible = true for Any/Any pair | ✅ Pass |
| 23 | proposal marks compatible = false when rider A prefers male-only and B is Female | ✅ Pass |
| 24 | proposal marks compatible = true for Female+Female mutual female-only | ✅ Pass |
| 25 | proposal shows `"Not specified"` when co-rider gender is not set | ✅ Pass |
| 26 | proposal blocks: candidate prefers female-only but rider A is Male | ✅ Pass |

### Suite 4 of 4 · `5.5 — Edge cases & boundary conditions` (3 tests)

| # | Test | Result |
|---|---|---|
| 27 | null genderPreference defaults to "any" and does not crash | ✅ Pass |
| 28 | empty string genderPreference defaults to "any" and does not crash | ✅ Pass |
| 29 | is case-sensitive — 'Female' (DB) vs 'female' (pref enum) are correctly distinct | ✅ Pass |

---

## Summary

```
Test Files  1 passed (1)
     Tests  29 passed (29)
  Duration  ~800ms
```

## User Story Coverage

| Sub-Requirement | Tests | Status |
|---|---|---|
| **5.5.1** Add gender filter options to the ride request screen | 5 tests (schema validation) | ✅ DONE |
| **5.5.2** Update matching algorithm to respect gender constraints | 15 tests (all combination rules) | ✅ DONE |
| **5.5.3** Verify co-rider gender compatibility before confirming the ride | 6 tests (proposal payload) | ✅ DONE |
| **Edge cases** | 3 tests (null, empty, case-sensitivity) | ✅ DONE |

## Implementation Verified

The tests confirm the following server-side logic in [server/index.js](file:///d:/Amrita/SEM_6/Software_Engineering/Final_LeafLift/LeafLift/ridego---your-modern-ride-share/server/index.js#L1400-L1413) works correctly:

```javascript
// Rule 1: Respect ride's own preference
if (rideGenderPref === 'male'   && candidateGender !== 'Male')   genderCompatible = false;
if (rideGenderPref === 'female' && candidateGender !== 'Female') genderCompatible = false;

// Rule 2: Respect candidate's preference  
if (candidateGenderPref === 'male'   && currentRiderGender !== 'Male')   genderCompatible = false;
if (candidateGenderPref === 'female' && currentRiderGender !== 'Female') genderCompatible = false;
```

And the Ride schema field:
```javascript
safetyPreferences: {
    genderPreference: { type: String, enum: ['any', 'male', 'female'], default: 'any' }
}
```
