/**
 * Test 5.1 — Phone Masking
 * Tests maskPhone() — shows first 2 + last 2 digits, rest XXXX.
 *
 * IMPLEMENTED in server/index.js:
 *   - maskPhone() helper
 *   - Used in ride accept to set contact.riderMasked / contact.driverMasked
 */
import { describe, it, expect } from 'vitest';
import { maskPhone } from '../setup.js';

describe('5.1 — Phone Masking', () => {
    it('should mask middle digits of 10-digit number', () => {
        expect(maskPhone('9876543210')).toBe('98******10');
    });

    it('should handle different phone lengths', () => {
        const result = maskPhone('12345678');
        expect(result.startsWith('12')).toBe(true);
        expect(result.endsWith('78')).toBe(true);
        expect(result).toContain('****');
    });

    it('should return mask for short numbers', () => {
        expect(maskPhone('123')).toBe('****');
    });

    it('should handle undefined/null gracefully', () => {
        expect(maskPhone(undefined)).toBe('****');
        expect(maskPhone(null)).toBe('****');
    });
});