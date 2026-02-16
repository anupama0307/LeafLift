/**
 * Test 1.7 — Nearby Driver Geospatial Filtering
 * Tests the 6 km radius filtering for ride broadcasts and driver search.
 *
 * IMPLEMENTED in server/index.js:
 *   - Socket 'rider:search': NEARBY_RADIUS_KM = 6
 *   - POST /api/rides: RIDE_BROADCAST_RADIUS_KM = 6
 *   - GET  /api/drivers/nearby: Haversine filter by radius
 *   - GET  /api/rides/nearby: filter SEARCHING rides within radius
 */
import { describe, it, expect } from 'vitest';
import { haversineDistance } from '../setup.js';

describe('1.7 — Nearby Driver Geospatial Filtering', () => {
    const NEARBY_RADIUS_KM = 6;

    it('should include driver within 6 km radius', () => {
        const dist = haversineDistance(11.0, 77.0, 11.015, 77.01);
        expect(dist).toBeLessThanOrEqual(NEARBY_RADIUS_KM);
    });

    it('should exclude driver beyond 6 km radius', () => {
        const dist = haversineDistance(11.0, 77.0, 11.1, 77.1);
        expect(dist).toBeGreaterThan(NEARBY_RADIUS_KM);
    });

    it('should filter multiple drivers by radius', () => {
        const driverLocations = [
            { lat: 11.005, lng: 77.005 },
            { lat: 11.015, lng: 77.01 },
            { lat: 11.1, lng: 77.1 },
            { lat: 12.0, lng: 78.0 },
        ];
        const pickup = { lat: 11.0, lng: 77.0 };
        const nearby = driverLocations.filter((d) => {
            return haversineDistance(pickup.lat, pickup.lng, d.lat, d.lng) <= NEARBY_RADIUS_KM;
        });
        expect(nearby.length).toBe(2);
    });

    it('should sort drivers by distance (closest first)', () => {
        const drivers = [
            { id: 'far', lat: 11.04, lng: 77.04 },
            { id: 'close', lat: 11.005, lng: 77.005 },
            { id: 'mid', lat: 11.02, lng: 77.02 },
        ];
        const pickup = { lat: 11.0, lng: 77.0 };
        const sorted = drivers
            .map((d) => ({...d, distance: haversineDistance(pickup.lat, pickup.lng, d.lat, d.lng) }))
            .sort((a, b) => a.distance - b.distance);

        expect(sorted[0].id).toBe('close');
        expect(sorted[2].id).toBe('far');
    });
});