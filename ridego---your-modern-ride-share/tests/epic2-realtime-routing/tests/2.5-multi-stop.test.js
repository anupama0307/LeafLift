/**
 * Test 2.5 — Multi-Stop Waypoints
 * Tests stops array management: PENDING → REACHED / SKIPPED transitions.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/stops/:stopIndex/reached
 *   - POST /api/rides/:rideId/stops/:stopIndex/skip
 *   - GET  /api/rides/:rideId/stops
 *   - Ride model: stops[], currentStopIndex
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride } from '../setup.js';

describe('2.5 — Multi-Stop Waypoints', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rider@test.com',
            phone: '9800000030',
            firstName: 'StopRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'driver@test.com',
            phone: '9900000030',
            firstName: 'StopDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should default stops to empty array and currentStopIndex to 0', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'D', lat: 11.1, lng: 77.1 },
            fare: 200,
        });
        expect(ride.stops.length).toBe(0);
        expect(ride.currentStopIndex).toBe(0);
    });

    it('should store multi-stop waypoints with order and status', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'D', lat: 11.1, lng: 77.1 },
            fare: 200,
            stops: [
                { address: 'Stop 1', lat: 11.03, lng: 77.03, order: 0, status: 'PENDING' },
                { address: 'Stop 2', lat: 11.06, lng: 77.06, order: 1, status: 'PENDING' },
            ],
        });
        expect(ride.stops.length).toBe(2);
        expect(ride.stops[0].status).toBe('PENDING');
        expect(ride.stops[1].order).toBe(1);
    });

    it('should mark stop as REACHED and advance currentStopIndex', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'D', lat: 11.1, lng: 77.1 },
            fare: 200,
            stops: [
                { address: 'Stop 1', lat: 11.03, lng: 77.03, order: 0, status: 'PENDING' },
                { address: 'Stop 2', lat: 11.06, lng: 77.06, order: 1, status: 'PENDING' },
            ],
        });

        ride.stops[0].status = 'REACHED';
        ride.stops[0].reachedAt = new Date();
        ride.currentStopIndex = 1;
        await ride.save();

        const updated = await Ride.findById(ride._id);
        expect(updated.stops[0].status).toBe('REACHED');
        expect(updated.stops[0].reachedAt).toBeDefined();
        expect(updated.currentStopIndex).toBe(1);
    });

    it('should mark stop as SKIPPED', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'D', lat: 11.1, lng: 77.1 },
            fare: 200,
            stops: [
                { address: 'Stop 1', lat: 11.03, lng: 77.03, order: 0, status: 'PENDING' },
            ],
        });

        ride.stops[0].status = 'SKIPPED';
        ride.currentStopIndex = 1;
        await ride.save();

        const updated = await Ride.findById(ride._id);
        expect(updated.stops[0].status).toBe('SKIPPED');
        expect(updated.currentStopIndex).toBe(1);
    });
});