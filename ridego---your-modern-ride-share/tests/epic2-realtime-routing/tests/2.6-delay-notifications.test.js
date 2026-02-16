/**
 * Test 2.6 — Delay Notifications
 * Tests shouldSendDelayAlert() — the delay detection logic used in
 * broadcastLiveEta() to send traffic delay notifications to riders.
 *
 * IMPLEMENTED in server/index.js:
 *   - broadcastLiveEta(): DELAY_THRESHOLD_MIN=5, COOLDOWN=5min
 *   - Creates Notification with type 'DELAY_ALERT'
 *   - Emits 'ride:delay-alert' via Socket.IO
 *   - Ride model: originalEtaMinutes, lastDelayAlertAt
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride, Notification, shouldSendDelayAlert } from '../setup.js';

describe('2.6 — Delay Notifications', () => {
    describe('shouldSendDelayAlert() logic', () => {
        it('should NOT alert when delay < 5 min', () => {
            expect(shouldSendDelayAlert(18, 15, null)).toBe(false); // 3 min delay
        });

        it('should alert when delay ≥ 5 min and no previous alert', () => {
            expect(shouldSendDelayAlert(25, 15, null)).toBe(true); // 10 min delay
        });

        it('should NOT alert again within 5 min cooldown', () => {
            const recentAlert = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
            expect(shouldSendDelayAlert(25, 15, recentAlert)).toBe(false);
        });

        it('should alert again after cooldown expires', () => {
            const oldAlert = new Date(Date.now() - 6 * 60 * 1000); // 6 min ago
            expect(shouldSendDelayAlert(25, 15, oldAlert)).toBe(true);
        });

        it('should NOT alert when ETA matches original (no delay)', () => {
            expect(shouldSendDelayAlert(15, 15, null)).toBe(false);
        });
    });

    describe('Ride model delay fields', () => {
        let rider, driver;

        beforeEach(async() => {
            rider = await User.create({
                role: 'RIDER',
                email: 'rdelay@test.com',
                phone: '9800000040',
                firstName: 'DelayRider',
                lastName: 'T',
                dob: '1995-01-01',
                gender: 'Male',
            });
            driver = await User.create({
                role: 'DRIVER',
                email: 'ddelay@test.com',
                phone: '9900000040',
                firstName: 'DelayDriver',
                lastName: 'T',
                dob: '1990-01-01',
                gender: 'Male',
            });
        });

        it('should store originalEtaMinutes on ride acceptance', async() => {
            const ride = await Ride.create({
                userId: rider._id,
                driverId: driver._id,
                status: 'ACCEPTED',
                pickup: { address: 'A', lat: 11.0, lng: 77.0 },
                dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
                fare: 120,
                originalEtaMinutes: 15,
            });
            expect(ride.originalEtaMinutes).toBe(15);
        });

        it('should store lastDelayAlertAt when delay alert is sent', async() => {
            const ride = await Ride.create({
                userId: rider._id,
                driverId: driver._id,
                status: 'ACCEPTED',
                pickup: { address: 'A', lat: 11.0, lng: 77.0 },
                dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
                fare: 120,
                originalEtaMinutes: 15,
            });

            ride.lastDelayAlertAt = new Date();
            await ride.save();

            const updated = await Ride.findById(ride._id);
            expect(updated.lastDelayAlertAt).toBeDefined();
        });

        it('should create delay notification', async() => {
            const notif = await Notification.create({
                userId: rider._id,
                title: 'Traffic Delay Detected',
                message: 'Your ride is delayed by ~8 min due to traffic. Updated ETA: 23 min.',
                type: 'DELAY_ALERT',
            });
            expect(notif.title).toBe('Traffic Delay Detected');
            expect(notif.type).toBe('DELAY_ALERT');
        });
    });
});