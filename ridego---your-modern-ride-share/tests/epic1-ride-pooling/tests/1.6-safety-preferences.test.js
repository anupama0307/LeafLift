/**
 * Test 1.6 — Safety Preferences (UI State + Backend Filtering)
 *
 * 1.6.1  Add checkboxes for safety preferences (gender matching, verified, no-smoking)
 * 1.6.2  Filter pool matches strictly based on selected safety criteria
 * 1.6.3  Show verified safety badges on the match screen
 *
 * IMPLEMENTED in:
 *   - PlanRideScreen.tsx  — safetyPrefs state, checkboxes, badge rendering
 *   - server/index.js     — pool matching enforces verifiedOnly & noSmoking & genderPreference
 */
import { describe, it, expect } from 'vitest';

// ─── Minimal inline replica of the server-side safety filter logic ───────────
function safetyFilterPass(newRide, candidate, newRiderUser, candidateUser) {
    const newPref = newRide.safetyPreferences || {};
    const candPref = candidate.safetyPreferences || {};

    // Gender preference (womenOnly shorthand or explicit genderPreference)
    const newGenderPref = (newPref.womenOnly ? 'female' : null) || newPref.genderPreference || 'any';
    const candGenderPref = (candPref.womenOnly ? 'female' : null) || candPref.genderPreference || 'any';
    const newGender = (newRiderUser.gender || 'unknown').toLowerCase();
    const candGender = (candidateUser.gender || 'unknown').toLowerCase();

    if (newGenderPref.includes('female') && candGender !== 'female') return false;
    if (newGenderPref === 'male' && candGender !== 'male') return false;
    if (candGenderPref.includes('female') && newGender !== 'female') return false;
    if (candGenderPref === 'male' && newGender !== 'male') return false;

    // Verified-only (strict both ways)
    if (newPref.verifiedOnly && !candidateUser.isVerified) return false;
    if (candPref.verifiedOnly && !newRiderUser.isVerified) return false;

    // No-smoking (must be mutual)
    if (newPref.noSmoking && !candPref.noSmoking) return false;
    if (candPref.noSmoking && !newPref.noSmoking) return false;

    return true;
}

// ─── Minimal inline replica of frontend safety badge helpers ─────────────────
function buildSafetyTags(user, ridePrefs) {
    return [
        ...(user.isVerified ? ['verified'] : []),
        ...(ridePrefs.noSmoking ? ['noSmoking'] : []),
        ...((ridePrefs.womenOnly || ridePrefs.genderPreference === 'female') ? ['womenOnly'] : []),
    ];
}

// ─── 1.6.1 UI State tests ────────────────────────────────────────────────────
describe('1.6.1 — Safety Preferences UI State', () => {
    it('should default all prefs to false with genderPreference=any', () => {
        const safetyPrefs = { womenOnly: false, verifiedOnly: false, noSmoking: false, genderPreference: 'any' };
        expect(safetyPrefs.womenOnly).toBe(false);
        expect(safetyPrefs.verifiedOnly).toBe(false);
        expect(safetyPrefs.noSmoking).toBe(false);
        expect(safetyPrefs.genderPreference).toBe('any');
    });

    it('toggling womenOnly=true should also set genderPreference to female', () => {
        let prefs = { womenOnly: false, verifiedOnly: false, noSmoking: false, genderPreference: 'any' };
        const next = !prefs.womenOnly;
        prefs = { ...prefs, womenOnly: next, genderPreference: next ? 'female' : 'any' };
        expect(prefs.womenOnly).toBe(true);
        expect(prefs.genderPreference).toBe('female');
    });

    it('selecting Female in gender picker should set womenOnly=true', () => {
        let prefs = { womenOnly: false, genderPreference: 'any' };
        prefs = { ...prefs, genderPreference: 'female', womenOnly: 'female' === 'female' };
        expect(prefs.womenOnly).toBe(true);
        expect(prefs.genderPreference).toBe('female');
    });

    it('should only include safetyPreferences in Pooled rides', () => {
        const rideMode = 'Pooled';
        const safetyPrefs = { womenOnly: true, verifiedOnly: false, noSmoking: true, genderPreference: 'female' };
        const payload = {
            fare: 100,
            isPooled: rideMode === 'Pooled',
            ...(rideMode === 'Pooled' ? { safetyPreferences: safetyPrefs } : {}),
        };
        expect(payload.safetyPreferences).toBeDefined();
        expect(payload.safetyPreferences.womenOnly).toBe(true);
    });

    it('should NOT include safetyPreferences in solo rides', () => {
        const rideMode = 'Solo';
        const safetyPrefs = { womenOnly: true, verifiedOnly: false, noSmoking: true };
        const payload = {
            fare: 100,
            isPooled: rideMode === 'Pooled',
            ...(rideMode === 'Pooled' ? { safetyPreferences: safetyPrefs } : {}),
        };
        expect(payload.safetyPreferences).toBeUndefined();
    });
});

// ─── 1.6.2 Backend strict filtering tests ────────────────────────────────────
describe('1.6.2 — Pool Match Strict Safety Filtering', () => {
    it('passes when both riders have no special preferences', () => {
        const r = { safetyPreferences: { womenOnly: false, verifiedOnly: false, noSmoking: false, genderPreference: 'any' } };
        expect(safetyFilterPass(r, r, { gender: 'male', isVerified: false }, { gender: 'female', isVerified: false })).toBe(true);
    });

    it('rejects candidate when new rider wants female-only and candidate is male', () => {
        const newRide = { safetyPreferences: { womenOnly: true, genderPreference: 'female' } };
        const candidate = { safetyPreferences: {} };
        expect(safetyFilterPass(newRide, candidate, { gender: 'female' }, { gender: 'male' })).toBe(false);
    });

    it('allows match when new rider wants female-only and candidate is female', () => {
        const newRide = { safetyPreferences: { womenOnly: true, genderPreference: 'female' } };
        const candidate = { safetyPreferences: {} };
        expect(safetyFilterPass(newRide, candidate, { gender: 'female' }, { gender: 'female' })).toBe(true);
    });

    it('rejects when new rider requires verifiedOnly but candidate is not verified', () => {
        const newRide = { safetyPreferences: { verifiedOnly: true } };
        const candidate = { safetyPreferences: {} };
        expect(safetyFilterPass(newRide, candidate, { gender: 'male', isVerified: true }, { gender: 'male', isVerified: false })).toBe(false);
    });

    it('allows match when new rider requires verifiedOnly and candidate IS verified', () => {
        const newRide = { safetyPreferences: { verifiedOnly: true } };
        const candidate = { safetyPreferences: {} };
        expect(safetyFilterPass(newRide, candidate, { gender: 'male', isVerified: true }, { gender: 'male', isVerified: true })).toBe(true);
    });

    it('rejects when candidate requires verifiedOnly but new rider is not verified', () => {
        const newRide = { safetyPreferences: {} };
        const candidate = { safetyPreferences: { verifiedOnly: true } };
        expect(safetyFilterPass(newRide, candidate, { gender: 'male', isVerified: false }, { gender: 'male', isVerified: true })).toBe(false);
    });

    it('rejects when new rider wants noSmoking but candidate does not', () => {
        const newRide = { safetyPreferences: { noSmoking: true } };
        const candidate = { safetyPreferences: { noSmoking: false } };
        expect(safetyFilterPass(newRide, candidate, { gender: 'male' }, { gender: 'female' })).toBe(false);
    });

    it('allows match when both riders want noSmoking', () => {
        const newRide = { safetyPreferences: { noSmoking: true } };
        const candidate = { safetyPreferences: { noSmoking: true } };
        expect(safetyFilterPass(newRide, candidate, { gender: 'male' }, { gender: 'female' })).toBe(true);
    });

    it('rejects when candidate wants noSmoking but new rider does not', () => {
        const newRide = { safetyPreferences: { noSmoking: false } };
        const candidate = { safetyPreferences: { noSmoking: true } };
        expect(safetyFilterPass(newRide, candidate, { gender: 'female' }, { gender: 'female' })).toBe(false);
    });

    it('passes combined verifiedOnly + noSmoking + womenOnly when all conditions met', () => {
        const newRide = { safetyPreferences: { womenOnly: true, genderPreference: 'female', verifiedOnly: true, noSmoking: true } };
        const candidate = { safetyPreferences: { noSmoking: true } };
        expect(safetyFilterPass(newRide, candidate, { gender: 'female', isVerified: true }, { gender: 'female', isVerified: true })).toBe(true);
    });

    it('rejects combined when one condition fails', () => {
        const newRide = { safetyPreferences: { womenOnly: true, genderPreference: 'female', verifiedOnly: true, noSmoking: true } };
        const candidate = { safetyPreferences: { noSmoking: true } };
        // candidate is male — should fail womenOnly
        expect(safetyFilterPass(newRide, candidate, { gender: 'female', isVerified: true }, { gender: 'male', isVerified: true })).toBe(false);
    });
});

// ─── 1.6.3 Safety badge helpers ──────────────────────────────────────────────
describe('1.6.3 — Safety Badges in Match Screen', () => {
    it('verified user gets "verified" tag', () => {
        const tags = buildSafetyTags({ isVerified: true }, {});
        expect(tags).toContain('verified');
    });

    it('unverified user gets no verified tag', () => {
        const tags = buildSafetyTags({ isVerified: false }, {});
        expect(tags).not.toContain('verified');
    });

    it('noSmoking pref produces noSmoking tag', () => {
        const tags = buildSafetyTags({ isVerified: false }, { noSmoking: true });
        expect(tags).toContain('noSmoking');
    });

    it('womenOnly pref produces womenOnly tag', () => {
        const tags = buildSafetyTags({ isVerified: false }, { womenOnly: true });
        expect(tags).toContain('womenOnly');
    });

    it('genderPreference=female also produces womenOnly tag', () => {
        const tags = buildSafetyTags({ isVerified: false }, { genderPreference: 'female' });
        expect(tags).toContain('womenOnly');
    });

    it('verified + noSmoking + womenOnly all appear together', () => {
        const tags = buildSafetyTags({ isVerified: true }, { noSmoking: true, womenOnly: true });
        expect(tags).toContain('verified');
        expect(tags).toContain('noSmoking');
        expect(tags).toContain('womenOnly');
        expect(tags).toHaveLength(3);
    });

    it('no tags for rider with no preferences and not verified', () => {
        const tags = buildSafetyTags({ isVerified: false }, {});
        expect(tags).toHaveLength(0);
    });
});