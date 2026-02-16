/**
 * Test 2.1 — OLA Directions API Payload Building
 * Tests buildOlaDirectionsPayload() which replicates POST /api/ola/directions logic.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/ola/directions (with waypoints support)
 */
import { describe, it, expect } from 'vitest';
import { buildOlaDirectionsPayload } from '../setup.js';

describe('2.1 — OLA Directions API Payload', () => {
    it('should build basic origin/destination payload', () => {
        const payload = buildOlaDirectionsPayload({ lat: 11.0, lng: 77.0 }, { lat: 11.05, lng: 77.05 });
        expect(payload.origin).toBe('11,77');
        expect(payload.destination).toBe('11.05,77.05');
        expect(payload.alternatives).toBe(true);
        expect(payload.traffic_metadata).toBe(true);
    });

    it('should include waypoints when provided', () => {
        const payload = buildOlaDirectionsPayload({ lat: 11.0, lng: 77.0 }, { lat: 11.1, lng: 77.1 }, [{ lat: 11.03, lng: 77.03 }, { lat: 11.06, lng: 77.06 }]);
        expect(payload.waypoints).toBe('11.03,77.03|11.06,77.06');
    });

    it('should omit waypoints when empty', () => {
        const payload = buildOlaDirectionsPayload({ lat: 11.0, lng: 77.0 }, { lat: 11.05, lng: 77.05 }, []);
        expect(payload.waypoints).toBeUndefined();
    });
});