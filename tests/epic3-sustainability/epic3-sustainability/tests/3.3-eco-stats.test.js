/**
 * Test 3.3 — User Eco Stats Aggregation
 * Tests aggregateUserEcoStats() and User model eco fields.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/complete  increments User stats via $inc
 *   - User model: totalCO2Saved, totalCO2Emitted, totalTrips, totalKmTraveled
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, aggregateUserEcoStats } from '../setup.js';

describe('3.3 — User Eco Stats Aggregation', () => {
    let user;

    beforeEach(async() => {
        user = await User.create({
            role: 'RIDER',
            email: 'eco@test.com',
            phone: '9800000060',
            firstName: 'EcoUser',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
            totalCO2Saved: 0,
            totalCO2Emitted: 0,
            totalTrips: 0,
            totalKmTraveled: 0,
        });
    });

    it('should increment stats after a ride completion', async() => {
        await User.findByIdAndUpdate(user._id, {
            $inc: { totalCO2Saved: 800, totalCO2Emitted: 400, totalTrips: 1, totalKmTraveled: 10 },
        });
        const updated = await User.findById(user._id);
        expect(updated.totalCO2Saved).toBe(800);
        expect(updated.totalCO2Emitted).toBe(400);
        expect(updated.totalTrips).toBe(1);
        expect(updated.totalKmTraveled).toBe(10);
    });

    it('should accumulate stats across multiple rides', async() => {
        await User.findByIdAndUpdate(user._id, {
            $inc: { totalCO2Saved: 800, totalCO2Emitted: 400, totalTrips: 1, totalKmTraveled: 10 },
        });
        await User.findByIdAndUpdate(user._id, {
            $inc: { totalCO2Saved: 600, totalCO2Emitted: 300, totalTrips: 1, totalKmTraveled: 8 },
        });
        const updated = await User.findById(user._id);
        expect(updated.totalTrips).toBe(2);
        expect(updated.totalKmTraveled).toBe(18);
        expect(updated.totalCO2Saved).toBe(1400);
    });

    it('should aggregate eco stats from completed rides in DB', async() => {
        // Create completed rides for user
        const { Ride } = await
        import ('../setup.js');
        await Ride.create({
            userId: user._id,
            status: 'COMPLETED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.1, lng: 77.1 },
            fare: 100,
            distance: '10 km',
            co2Emissions: 400,
            co2Saved: 800,
        });
        await Ride.create({
            userId: user._id,
            status: 'COMPLETED',
            pickup: { address: 'C', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'D', lat: 11.1, lng: 77.1 },
            fare: 80,
            distance: '8 km',
            co2Emissions: 300,
            co2Saved: 600,
        });
        const stats = await aggregateUserEcoStats(user._id);
        expect(stats.totalCO2Emitted).toBe(700);
        expect(stats.totalCO2Saved).toBe(1400);
        expect(stats.totalKmTraveled).toBe(18);
        expect(stats.totalTrips).toBe(2);
    });
});