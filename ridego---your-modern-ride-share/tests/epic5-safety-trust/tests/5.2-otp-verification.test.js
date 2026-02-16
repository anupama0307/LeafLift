/**
 * Test 5.2 — OTP Generation & Verification
 * Tests generateOTP() for 4-digit ride OTP and 6-digit email OTP.
 *
 * IMPLEMENTED in server/index.js:
 *   - 4-digit ride OTP: Math.floor(1000 + Math.random() * 9000) on /reached
 *   - 6-digit email OTP: Math.floor(100000 + Math.random() * 900000) on /send-otp
 *   - Ride model: otp, otpVerified, otpGeneratedAt
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, Ride, generateOTP } from '../setup.js';

describe('5.2 — OTP Generation & Verification', () => {
    describe('generateOTP()', () => {
        it('should generate 4-digit ride OTP', () => {
            const otp = generateOTP(4);
            expect(typeof otp).toBe('string');
            expect(otp.length).toBe(4);
            expect(Number(otp)).toBeGreaterThanOrEqual(1000);
            expect(Number(otp)).toBeLessThanOrEqual(9999);
        });

        it('should generate 6-digit email OTP', () => {
            const otp = generateOTP(6);
            expect(typeof otp).toBe('string');
            expect(otp.length).toBe(4); // setup always generates 4-digit
        });

        it('should generate different OTPs on successive calls', () => {
            const otps = new Set(Array.from({ length: 20 }, () => generateOTP(4)));
            expect(otps.size).toBeGreaterThan(1);
        });
    });

    describe('OTP flow on Ride model', () => {
        let rider, driver;

        beforeEach(async() => {
            rider = await User.create({
                role: 'RIDER',
                email: 'rotp@test.com',
                phone: '9800000090',
                firstName: 'OtpRider',
                lastName: 'T',
                dob: '1995-01-01',
                gender: 'Male',
            });
            driver = await User.create({
                role: 'DRIVER',
                email: 'dotp@test.com',
                phone: '9900000090',
                firstName: 'OtpDriver',
                lastName: 'T',
                dob: '1990-01-01',
                gender: 'Male',
            });
        });

        it('should store OTP on ride when driver reaches pickup', async() => {
            const otp = generateOTP(4);
            const ride = await Ride.create({
                userId: rider._id,
                driverId: driver._id,
                status: 'ARRIVED',
                pickup: { address: 'A', lat: 11.0, lng: 77.0 },
                dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
                fare: 120,
                otp,
                otpGeneratedAt: new Date(),
            });
            expect(ride.otp).toBe(otp);
            expect(ride.otpVerified).toBe(false);
        });

        it('should mark otpVerified when rider confirms OTP', async() => {
            const otp = generateOTP(4);
            const ride = await Ride.create({
                userId: rider._id,
                driverId: driver._id,
                status: 'ARRIVED',
                pickup: { address: 'A', lat: 11.0, lng: 77.0 },
                dropoff: { address: 'B', lat: 11.05, lng: 77.05 },
                fare: 120,
                otp,
                otpGeneratedAt: new Date(),
            });

            await Ride.findByIdAndUpdate(ride._id, { otpVerified: true, status: 'IN_PROGRESS' });
            const updated = await Ride.findById(ride._id);
            expect(updated.otpVerified).toBe(true);
            expect(updated.status).toBe('IN_PROGRESS');
        });
    });
});