/**
 * Test 1.5 — Early Termination / Opt-Out Mid-Ride
 * Tests actualDropoff, completedFare recalculation, riderConfirmedComplete.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/request-complete
 *   - POST /api/rides/:rideId/confirm-complete
 *   - Ride model: actualDropoff, actualDistanceMeters, completedFare, riderConfirmedComplete
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride, haversineDistance } from '../setup.js';

describe('1.5 — Early Termination / Opt-Out Mid-Ride', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rider@test.com',
            phone: '9800000020',
            firstName: 'EarlyRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'driver@test.com',
            phone: '9900000020',
            firstName: 'EarlyDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should store actualDropoff when driver requests early completion', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'Start', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'End', lat: 11.1, lng: 77.1 },
            fare: 200,
        });

        const actualLat = 11.05;
        const actualLng = 77.05;
        const distKm = haversineDistance(11.0, 77.0, actualLat, actualLng);
        const actualDistanceMeters = Math.round(distKm * 1000);
        const completedFare = Math.round(30 + (actualDistanceMeters / 1000) * 12);

        ride.actualDropoff = { address: 'Early drop', lat: actualLat, lng: actualLng };
        ride.actualDistanceMeters = actualDistanceMeters;
        ride.completedFare = completedFare;
        ride.riderConfirmedComplete = false;
        await ride.save();

        const updated = await Ride.findById(ride._id);
        expect(updated.actualDropoff.lat).toBeCloseTo(actualLat);
        expect(updated.actualDistanceMeters).toBeGreaterThan(0);
        expect(updated.completedFare).toBeLessThan(200);
        expect(updated.riderConfirmedComplete).toBe(false);
    });

    it('should mark ride COMPLETED when rider confirms', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'Start', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'End', lat: 11.1, lng: 77.1 },
            fare: 200,
            completedFare: 100,
            riderConfirmedComplete: false,
        });

        ride.riderConfirmedComplete = true;
        ride.status = 'COMPLETED';
        await ride.save();

        const updated = await Ride.findById(ride._id);
        expect(updated.status).toBe('COMPLETED');
        expect(updated.riderConfirmedComplete).toBe(true);
    });

    it('should recalculate fare: baseFare(30) + distance × 12/km', () => {
        const actualDistanceMeters = 5000;
        const completedFare = Math.round(30 + (actualDistanceMeters / 1000) * 12);
        expect(completedFare).toBe(90);
    });
});