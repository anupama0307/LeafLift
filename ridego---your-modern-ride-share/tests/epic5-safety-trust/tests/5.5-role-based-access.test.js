/**
 * Test 5.5 — Role-Based Access (RIDER / DRIVER)
 * Tests hasRole() and role enum on User model.
 *
 * IMPLEMENTED in server/index.js:
 *   - User model: role enum ['RIDER', 'DRIVER']
 *   - Role-based dashboard routing in frontend
 */
import { describe, it, expect } from 'vitest';
import { User, hasRole } from '../setup.js';

describe('5.5 — Role-Based Access', () => {
    it('should create RIDER user', async() => {
        const user = await User.create({
            role: 'RIDER',
            email: 'r@test.com',
            phone: '9800000120',
            firstName: 'Rider',
            lastName: 'T',
            dob: '1995-01-01',
            gender: 'Male',
        });
        expect(user.role).toBe('RIDER');
    });

    it('should create DRIVER user', async() => {
        const user = await User.create({
            role: 'DRIVER',
            email: 'd@test.com',
            phone: '9900000120',
            firstName: 'Driver',
            lastName: 'T',
            dob: '1990-01-01',
            gender: 'Male',
        });
        expect(user.role).toBe('DRIVER');
    });

    it('should validate role via hasRole()', () => {
        expect(hasRole({ role: 'RIDER' }, 'RIDER')).toBe(true);
        expect(hasRole({ role: 'DRIVER' }, 'RIDER')).toBe(false);
        expect(hasRole({ role: 'DRIVER' }, 'DRIVER')).toBe(true);
    });

    it('should handle missing role', () => {
        expect(hasRole({}, 'RIDER')).toBe(false);
        expect(hasRole(null, 'RIDER')).toBeFalsy();
    });
});