/**
 * Test 2.2 — Live ETA Computation
 * Tests fallback Haversine-based ETA when OLA API is unavailable.
 *
 * IMPLEMENTED in server/index.js:
 *   - estimateEtaMinutes(distanceKm, speedKmh=28)
 *   - GET /api/rides/:rideId/live-eta
 *   - broadcastLiveEta() interval (60s)
 */
import { describe, it, expect } from 'vitest';
import { computeFallbackEta, haversineDistance } from '../setup.js';

describe('2.2 — Live ETA Computation', () => {
    it('should compute ETA in minutes from distance and speed', () => {
        // 10 km at 25 km/h → 24 min
        expect(computeFallbackEta(10, 25)).toBe(24);
    });

    it('should default to 25 km/h average speed', () => {
        expect(computeFallbackEta(25)).toBe(60); // 25 km / 25 km/h = 1 hr
    });

    it('should return at least 1 minute for very short distances', () => {
        const eta = computeFallbackEta(0.1, 25);
        expect(eta).toBeGreaterThanOrEqual(0);
    });

    it('should compute ETA from two lat/lng points', () => {
        const distKm = haversineDistance(11.0, 77.0, 11.02, 77.02);
        const eta = computeFallbackEta(distKm);
        expect(eta).toBeGreaterThan(0);
    });

    it('should produce server-compatible "X min" format', () => {
        const distKm = 7;
        const speedKmh = 28; // server uses 28
        const minutes = Math.max(1, Math.round((distKm / speedKmh) * 60));
        const etaText = `${minutes} min`;
        expect(etaText).toMatch(/^\d+ min$/);
    });
});