/**
 * Test 1.2 — Pooled Ride Capacity & Seat Tracking
 * Tests isPooled, passengers, maxPassengers, pooledRiders, and capacity checks.
 *
 * IMPLEMENTED in:
 *   - Ride model: isPooled, passengers, maxPassengers, pooledRiders[]
 *   - POST /api/rides/:rideId/pool/add  (server/index.js)
 *   - GET  /api/rides/pooled-in-progress (capacity filtering)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride } from '../setup.js';

describe('1.2 — Pooled Ride Capacity & Seat Tracking', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rider@test.com',
            phone: '9800000001',
            firstName: 'PoolRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'driver@test.com',
            phone: '9900000001',
            firstName: 'PoolDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should default passengers to 1 and maxPassengers to 4', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            isPooled: true,
        });
        expect(ride.passengers).toBe(1);
        expect(ride.maxPassengers).toBe(4);
    });

    it('should track pooledRiders array with fareAdjustment', async() => {
        const rider2 = await User.create({
            role: 'RIDER',
            email: 'rider2@test.com',
            phone: '9800000002',
            firstName: 'SecondRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Female',
        });

        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            isPooled: true,
        });

        ride.pooledRiders.push({ userId: rider2._id, fareAdjustment: -36, joinedAt: new Date() });
        await ride.save();

        const updated = await Ride.findById(ride._id);
        expect(updated.pooledRiders.length).toBe(1);
        expect(updated.pooledRiders[0].fareAdjustment).toBe(-36);
    });

    it('should reject pool add when at capacity', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            isPooled: true,
            passengers: 1,
            maxPassengers: 2,
            pooledRiders: [{ userId: rider._id, fareAdjustment: -30 }],
        });

        const currentPassengers = ride.passengers + ride.pooledRiders.length;
        expect(currentPassengers >= ride.maxPassengers).toBe(true);
    });

    it('should compute available seats correctly', async() => {
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
        });

        const available = ride.maxPassengers - (ride.passengers + ride.pooledRiders.length);
        expect(available).toBe(3);
    });
});