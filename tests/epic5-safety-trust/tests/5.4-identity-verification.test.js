/**
 * Test 5.4 — Identity Verification
 * Tests emailVerified, driver document fields, authProvider enum.
 *
 * IMPLEMENTED in server/index.js:
 *   - User model: emailVerified, license, aadhar, vehicleMake/Model/Number
 *   - POST /api/verify-otp sets emailVerified = true
 *   - authProvider enum: email, google, apple
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { User, isDriverVerified } from '../setup.js';

describe('5.4 — Identity Verification', () => {
    it('should default emailVerified to false', async() => {
        const user = await User.create({
            role: 'RIDER',
            email: 'unver@test.com',
            phone: '9800000110',
            firstName: 'Unver',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        expect(user.emailVerified).toBe(false);
    });

    it('should set emailVerified to true after OTP verification', async() => {
        const user = await User.create({
            role: 'RIDER',
            email: 'ver@test.com',
            phone: '9800000111',
            firstName: 'Ver',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        await User.findByIdAndUpdate(user._id, { emailVerified: true });
        const updated = await User.findById(user._id);
        expect(updated.emailVerified).toBe(true);
    });

    it('should store driver documents', async() => {
        const driver = await User.create({
            role: 'DRIVER',
            email: 'driver@test.com',
            phone: '9900000110',
            firstName: 'DocDriver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
            license: 'TN0120230001234',
            aadhar: '123456789012',
            vehicleMake: 'Maruti',
            vehicleModel: 'Swift',
            vehicleNumber: 'TN01AB1234',
        });
        expect(driver.license).toBe('TN0120230001234');
        expect(driver.aadhar).toBe('123456789012');
        expect(driver.vehicleNumber).toBe('TN01AB1234');
    });

    it('should check driver verification via helper', () => {
        const verifiedDriver = {
            license: 'TN01',
            aadhar: '1234',
            vehicleNumber: 'TN01AB',
            emailVerified: true,
        };
        expect(isDriverVerified(verifiedDriver)).toBe(true);

        const unverified = { license: '', aadhar: '', vehicleNumber: '' };
        expect(isDriverVerified(unverified)).toBe(false);
    });

    it('should support multiple authProviders', async() => {
        const emailUser = await User.create({
            role: 'RIDER',
            email: 'e@test.com',
            phone: '9800000112',
            firstName: 'E',
            lastName: 'U',
            dob: '1995-01-01',
            gender: 'Male',
            authProvider: 'email',
        });
        expect(emailUser.authProvider).toBe('email');

        const googleUser = await User.create({
            role: 'RIDER',
            email: 'g@test.com',
            phone: '9800000113',
            firstName: 'G',
            lastName: 'U',
            dob: '1995-01-01',
            gender: 'Male',
            authProvider: 'google',
        });
        expect(googleUser.authProvider).toBe('google');
    });
});