/**
 * Test 2.7 — Driver Location Tracking
 * Tests ride-level location storage (riderLocation, driverLocation)
 * and the etaToPickup / etaToDropoff fields.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/location (stores riderLocation or driverLocation)
 *   - Socket 'driver:location' event (broadcasts to riders)
 *   - Ride model: driverLocation, riderLocation, etaToPickup, etaToDropoff
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride } from '../setup.js';

describe('2.7 — Driver Location Tracking', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rloc@test.com',
            phone: '9800000050',
            firstName: 'LocRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'dloc@test.com',
            phone: '9900000050',
            firstName: 'LocDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should store driverLocation on ride', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            driverLocation: { lat: 11.01, lng: 77.01, updatedAt: new Date() },
        });
        expect(ride.driverLocation.lat).toBeCloseTo(11.01);
    });

    it('should update driverLocation over time', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            driverLocation: { lat: 11.01, lng: 77.01, updatedAt: new Date() },
        });

        await Ride.findByIdAndUpdate(ride._id, {
            driverLocation: { lat: 11.03, lng: 77.03, updatedAt: new Date() },
        });

        const updated = await Ride.findById(ride._id);
        expect(updated.driverLocation.lat).toBeCloseTo(11.03);
    });

    it('should store riderLocation on ride', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'IN_PROGRESS',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            riderLocation: { lat: 11.02, lng: 77.02, updatedAt: new Date() },
        });
        expect(ride.riderLocation.lat).toBeCloseTo(11.02);
    });

    it('should store ETA strings on ride', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            etaToPickup: '8 min',
            etaToDropoff: '25 min',
        });
        expect(ride.etaToPickup).toBe('8 min');
        expect(ride.etaToDropoff).toBe('25 min');
    });
});