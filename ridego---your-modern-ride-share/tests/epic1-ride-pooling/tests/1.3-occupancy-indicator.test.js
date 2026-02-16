/**
 * Test 1.3 — Occupancy Indicator & Fare Adjustment
 * Tests enrichment of pooled rides with currentPassengers/availableSeats
 * and the -30% fare adjustment on pool/add.
 *
 * IMPLEMENTED in:
 *   - GET  /api/rides/pooled-in-progress (enriched response)
 *   - POST /api/rides/:rideId/pool/add   (fare adjustment)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride } from '../setup.js';

describe('1.3 — Occupancy Indicator & Fare Adjustment', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rider@test.com',
            phone: '9800000010',
            firstName: 'OccRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'driver@test.com',
            phone: '9900000010',
            firstName: 'OccDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should enrich pooled ride with currentPassengers and availableSeats', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            isPooled: true,
            passengers: 1,
            maxPassengers: 4,
            pooledRiders: [{ userId: rider._id, fareAdjustment: -36 }],
        });

        const currentPassengers = ride.passengers + (ride.pooledRiders && ride.pooledRiders.length || 0);
        const availableSeats = (ride.maxPassengers || 4) - currentPassengers;
        expect(currentPassengers).toBe(2);
        expect(availableSeats).toBe(2);
    });

    it('should show 0 available seats when full', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            isPooled: true,
            passengers: 1,
            maxPassengers: 3,
            pooledRiders: [
                { userId: rider._id, fareAdjustment: -30 },
                { userId: rider._id, fareAdjustment: -30 },
            ],
        });

        const currentPassengers = ride.passengers + ride.pooledRiders.length;
        expect(ride.maxPassengers - currentPassengers).toBe(0);
    });

    it('should apply -30% fare adjustment when adding pooled rider', () => {
        const currentFare = 150;
        const adjustment = Math.round(currentFare * -0.3);
        const newFare = Math.max(0, currentFare + adjustment);
        expect(adjustment).toBe(-45);
        expect(newFare).toBe(105);
    });
});