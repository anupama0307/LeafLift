/**
 * Test 5.6 — Contact Masking on Ride Accept
 * Tests that rider/driver phone numbers are masked on ride accept.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/accept stores contact.riderMasked & contact.driverMasked
 *   - Uses maskPhone() helper
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride, maskPhone } from '../setup.js';

describe('5.6 — Contact Masking on Ride Accept', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rmask@test.com',
            phone: '9876543210',
            firstName: 'MaskRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'dmask@test.com',
            phone: '9123456789',
            firstName: 'MaskDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should store masked contacts when ride is accepted', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            contact: {
                riderMasked: maskPhone(rider.phone),
                driverMasked: maskPhone(driver.phone),
            },
        });

        expect(ride.contact.riderMasked).toBe('98******10');
        expect(ride.contact.driverMasked).toBe('91******89');
    });

    it('should not expose real phone in masked field', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 120,
            contact: {
                riderMasked: maskPhone(rider.phone),
                driverMasked: maskPhone(driver.phone),
            },
        });

        expect(ride.contact.riderMasked).not.toBe(rider.phone);
        expect(ride.contact.driverMasked).not.toBe(driver.phone);
    });
});