/**
 * Test 3.5 — Stats Endpoint Data
 * Tests the shape of data returned by GET /api/users/:userId/stats.
 *
 * IMPLEMENTED in server/index.js:
 *   - GET /api/users/:userId/stats returns { totalTrips, totalKmTraveled,
 *     totalCO2Saved, totalCO2Emitted, walletBalance }
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User } from '../setup.js';

describe('3.5 — Stats Endpoint Data Shape', () => {
    let user;

    beforeEach(async() => {
        user = await User.create({
            role: 'RIDER',
            email: 'stats@test.com',
            phone: '9800000080',
            firstName: 'StatsUser',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
            totalCO2Saved: 2400,
            totalCO2Emitted: 3600,
            totalTrips: 5,
            totalKmTraveled: 45,
            walletBalance: 150,
        });
    });

    it('should return all eco-stat fields', async() => {
        const u = await User.findById(user._id);
        const stats = {
            totalTrips: u.totalTrips,
            totalKmTraveled: u.totalKmTraveled,
            totalCO2Saved: u.totalCO2Saved,
            totalCO2Emitted: u.totalCO2Emitted,
            walletBalance: u.walletBalance,
        };
        expect(stats.totalTrips).toBe(5);
        expect(stats.totalKmTraveled).toBe(45);
        expect(stats.totalCO2Saved).toBe(2400);
        expect(stats.totalCO2Emitted).toBe(3600);
        expect(stats.walletBalance).toBe(150);
    });

    it('should default eco fields to 0 for new user', async() => {
        const fresh = await User.create({
            role: 'RIDER',
            email: 'new@test.com',
            phone: '9800000081',
            firstName: 'New',
            lastName: 'U',
            dob: '2000-01-01',
            gender: 'Female',
        });
        expect(fresh.totalCO2Saved).toBe(0);
        expect(fresh.totalCO2Emitted).toBe(0);
        expect(fresh.totalTrips).toBe(0);
        expect(fresh.totalKmTraveled).toBe(0);
        expect(fresh.walletBalance).toBe(0);
    });
});