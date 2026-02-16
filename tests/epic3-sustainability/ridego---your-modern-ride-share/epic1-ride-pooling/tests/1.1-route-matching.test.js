/**
 * Test 1.1 — Route Matching via Daily Routes
 * Tests the GET /api/rider/match-driver logic: drivers with active dailyRoutes
 * whose source OR destination is within 5 km of the rider's pickup/dropoff.
 *
 * IMPLEMENTED in server/index.js lines 503–540
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, haversineDistance, findMatchingDrivers } from '../setup.js';

describe('1.1 — Route Matching (Daily Route)', () => {
    let driver1, driver2;

    beforeEach(async() => {
        driver1 = await User.create({
            role: 'DRIVER',
            email: 'd1@test.com',
            phone: '9900000001',
            firstName: 'Near',
            lastName: 'Driver',
            dob: '1990-01-01',
            gender: 'Male',
            dailyRoute: {
                source: { address: 'Coimbatore RS', lat: 11.0016, lng: 76.9558 },
                destination: { address: 'Peelamedu', lat: 11.0244, lng: 77.0282 },
                isActive: true,
            },
        });

        driver2 = await User.create({
            role: 'DRIVER',
            email: 'd2@test.com',
            phone: '9900000002',
            firstName: 'Far',
            lastName: 'Driver',
            dob: '1990-01-01',
            gender: 'Male',
            dailyRoute: {
                source: { address: 'Chennai Central', lat: 13.0827, lng: 80.2707 },
                destination: { address: 'T Nagar', lat: 13.0418, lng: 80.2341 },
                isActive: true,
            },
        });
    });

    it('should match driver whose source is within 5 km of rider pickup', async() => {
        const matches = await findMatchingDrivers(11.005, 76.960);
        expect(matches.length).toBe(1);
        expect(matches[0].email).toBe('d1@test.com');
    });

    it('should NOT match driver whose route is far away', async() => {
        const matches = await findMatchingDrivers(11.005, 76.960);
        const farMatch = matches.find((d) => d.email === 'd2@test.com');
        expect(farMatch).toBeUndefined();
    });

    it('should NOT match drivers with inactive dailyRoute', async() => {
        await User.findByIdAndUpdate(driver1._id, { 'dailyRoute.isActive': false });
        const matches = await findMatchingDrivers(11.005, 76.960);
        expect(matches.length).toBe(0);
    });

    it('should match driver by destination proximity too', async() => {
        const matches = await findMatchingDrivers(11.025, 77.025);
        expect(matches.length).toBe(1);
    });

    it('should return empty for a location with no nearby drivers', async() => {
        const matches = await findMatchingDrivers(28.6139, 77.2090);
        expect(matches.length).toBe(0);
    });
});

describe('1.1 — Haversine Distance', () => {
    it('should compute distance between known points', () => {
        const dist = haversineDistance(11.0016, 76.9558, 11.0244, 77.0282);
        expect(dist).toBeGreaterThan(5);
        expect(dist).toBeLessThan(12);
    });

    it('should return 0 for same point', () => {
        expect(haversineDistance(11.0, 77.0, 11.0, 77.0)).toBe(0);
    });
});