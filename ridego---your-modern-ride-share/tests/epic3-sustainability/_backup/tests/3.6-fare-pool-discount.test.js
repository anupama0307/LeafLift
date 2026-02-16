/**
 * Test 3.6 — Fare Calculation with Pool Discount
 * Tests calculateFare() which mirrors the server's fare formula.
 *
 * IMPLEMENTED in server/index.js:
 *   - Pool fare = -30% via fareAdjustment on pool/add endpoint
 *   - Base fare formula: baseFare(30) + 12/km
 *   - PlanRideScreen shows "Pool & save ₹X per person"
 */
import { describe, it, expect } from 'vitest';
import { calculateFare } from '../setup.js';

describe('3.6 — Fare Calculation with Pool Discount', () => {
    it('should compute solo fare = baseFare(30) + 12/km', () => {
        expect(calculateFare(10, 'CAR', false)).toBe(150); // 30 + 10*12
    });

    it('should compute pooled fare ≈ 67% of solo fare', () => {
        const soloFare = calculateFare(10, 'CAR', false); // 150
        const poolFare = calculateFare(10, 'CAR', true);
        // Pool fare ≈ solo * 0.67 = 101
        expect(poolFare).toBeLessThan(soloFare);
        expect(poolFare).toBe(Math.round(soloFare * 0.67));
    });

    it('should scale linearly with distance', () => {
        const fare5 = calculateFare(5, 'CAR', false); // 30 + 60 = 90
        const fare10 = calculateFare(10, 'CAR', false); // 30 + 120 = 150
        expect(fare10 - fare5).toBe(60); // 5 * 12
    });

    it('should compute fare savings', () => {
        const solo = calculateFare(10, 'CAR', false);
        const pool = calculateFare(10, 'CAR', true);
        const savings = solo - pool;
        expect(savings).toBeGreaterThan(0);
    });
});