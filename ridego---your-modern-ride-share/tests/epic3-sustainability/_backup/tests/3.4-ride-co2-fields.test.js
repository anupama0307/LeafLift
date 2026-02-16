/**
 * Test 3.4 — Ride CO₂ Fields on Completion
 * Tests that co2Emissions and co2Saved are stored on the Ride model.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/complete stores co2Emissions + co2Saved
 *   - Ride model: co2Emissions, co2Saved (Number)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride, calculateCO2, calculateCO2Saved } from '../setup.js';

describe('3.4 — Ride CO₂ Fields on Completion', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rc@test.com',
            phone: '9800000070',
            firstName: 'CompRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
            totalCO2Saved: 0,
            totalCO2Emitted: 0,
            totalTrips: 0,
            totalKmTraveled: 0,
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'dc@test.com',
            phone: '9900000070',
            firstName: 'CompDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
    });

    it('should store co2Emissions and co2Saved on ride completion', async() => {
        const distKm = 15;
        const type = 'CAR';
        const co2Emissions = calculateCO2(distKm, type); // 1800
        const co2Saved = calculateCO2Saved(distKm, type); // 1200

        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'COMPLETED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.1, lng: 77.1 },
            fare: 300,
            distance: distKm,
            co2Emissions,
            co2Saved,
        });

        expect(ride.co2Emissions).toBe(1800);
        expect(ride.co2Saved).toBe(1200); // max(0, 1800 - 600) = 1200
    });

    it('should update user stats via $inc on completion', async() => {
        const distKm = 15;
        const co2Emissions = calculateCO2(distKm, 'CAR');
        const co2Saved = calculateCO2Saved(distKm, 'CAR');
        const kmTraveled = distKm;

        await User.findByIdAndUpdate(rider._id, {
            $inc: {
                totalCO2Emitted: co2Emissions,
                totalCO2Saved: co2Saved,
                totalTrips: 1,
                totalKmTraveled: kmTraveled,
            },
        });

        const updated = await User.findById(rider._id);
        expect(updated.totalCO2Emitted).toBe(1800);
        expect(updated.totalCO2Saved).toBe(1200); // max(0, 1800 - 600)
        expect(updated.totalTrips).toBe(1);
        expect(updated.totalKmTraveled).toBe(15);
    });
});