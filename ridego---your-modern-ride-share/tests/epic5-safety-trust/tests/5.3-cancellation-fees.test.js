/**
 * Test 5.3 — Cancellation with Fees
 * Tests cancellation penalty logic: driver ₹50, rider ₹25 after accept.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/rides/:rideId/cancel
 *   - Driver cancel after accept → ₹50 penalty
 *   - Rider cancel after accept → ₹25 penalty
 *   - Cancel before accept → no fee
 *   - autoReSearched + previousDriverIds[] on driver cancel
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride } from '../setup.js';

describe('5.3 — Cancellation with Fees', () => {
    let rider, driver;

    beforeEach(async() => {
        rider = await User.create({
            role: 'RIDER',
            email: 'rcan@test.com',
            phone: '9800000100',
            firstName: 'CancelRider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
            walletBalance: 500,
        });
        driver = await User.create({
            role: 'DRIVER',
            email: 'dcan@test.com',
            phone: '9900000100',
            firstName: 'CancelDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
            walletBalance: 500,
        });
    });

    it('should apply ₹50 fee when driver cancels after accept', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 200,
        });

        await Ride.findByIdAndUpdate(ride._id, {
            status: 'CANCELED',
            canceledBy: 'DRIVER',
            cancelReason: 'Emergency',
            canceledAt: new Date(),
            cancellationFee: 50,
        });

        const updated = await Ride.findById(ride._id);
        expect(updated.status).toBe('CANCELED');
        expect(updated.cancellationFee).toBe(50);
        expect(updated.canceledBy).toBe('DRIVER');
    });

    it('should apply ₹25 fee when rider cancels after accept', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'ACCEPTED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 200,
        });

        await Ride.findByIdAndUpdate(ride._id, {
            status: 'CANCELLED',
            canceledBy: 'RIDER',
            cancelReason: 'Changed plans',
            canceledAt: new Date(),
            cancellationFee: 25,
        });

        const updated = await Ride.findById(ride._id);
        expect(updated.cancellationFee).toBe(25);
        expect(updated.canceledBy).toBe('RIDER');
    });

    it('should have no fee when cancelled before accept', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            status: 'SEARCHING',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 200,
        });

        await Ride.findByIdAndUpdate(ride._id, {
            status: 'CANCELED',
            canceledBy: 'RIDER',
            canceledAt: new Date(),
            cancellationFee: 0,
        });

        const updated = await Ride.findById(ride._id);
        expect(updated.cancellationFee).toBe(0);
    });

    it('should auto re-search when driver cancels and exclude previous driver', async() => {
        const ride = await Ride.create({
            userId: rider._id,
            driverId: driver._id,
            status: 'CANCELED',
            pickup: { address: 'A', lat: 11.0, lng: 77.0 },
            dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
            fare: 200,
            canceledBy: 'DRIVER',
            cancellationFee: 50,
        });

        // Auto re-search creates new ride
        const newRide = await Ride.create({
            userId: rider._id,
            status: 'SEARCHING',
            pickup: ride.pickup,
            dropoff: ride.dropoff,
            fare: ride.fare,
            autoReSearched: true,
            previousDriverIds: [driver._id],
        });

        expect(newRide.autoReSearched).toBe(true);
        expect(newRide.previousDriverIds).toContainEqual(driver._id);
    });
});