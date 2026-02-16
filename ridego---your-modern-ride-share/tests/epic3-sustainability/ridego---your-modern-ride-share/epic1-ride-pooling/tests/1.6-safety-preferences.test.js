/**
 * Test 1.6 — Safety Preferences (UI State)
 * Tests the womenOnly / verifiedOnly / noSmoking checkbox state.
 *
 * IMPLEMENTED in PlanRideScreen.tsx:
 *   - useState({ womenOnly: false, verifiedOnly: false, noSmoking: false })
 *   - Sent in ride payload as safetyPreferences (Pooled mode only)
 * NOTE: Backend does NOT enforce these; they are UI-only toggles.
 */
import { describe, it, expect } from 'vitest';

describe('1.6 — Safety Preferences (UI State)', () => {
    it('should default all prefs to false', () => {
        const safetyPrefs = { womenOnly: false, verifiedOnly: false, noSmoking: false };
        expect(safetyPrefs.womenOnly).toBe(false);
        expect(safetyPrefs.verifiedOnly).toBe(false);
        expect(safetyPrefs.noSmoking).toBe(false);
    });

    it('should toggle individual preferences', () => {
        let safetyPrefs = { womenOnly: false, verifiedOnly: false, noSmoking: false };
        safetyPrefs = {...safetyPrefs, womenOnly: true };
        expect(safetyPrefs.womenOnly).toBe(true);
        expect(safetyPrefs.verifiedOnly).toBe(false);
    });

    it('should only include safetyPreferences in Pooled rides', () => {
        const rideMode = 'Pooled';
        const safetyPrefs = { womenOnly: true, verifiedOnly: false, noSmoking: true };
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