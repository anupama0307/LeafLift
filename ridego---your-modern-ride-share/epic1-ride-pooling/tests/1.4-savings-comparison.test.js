/**
 * Test 1.4 — Savings Comparison (Fare + CO₂)
 * Tests fare & CO₂ calculations for pooled vs solo.
 *
 * IMPLEMENTED in PlanRideScreen.tsx:
 *   - calculateCO2(distMeters, type): rates {BIKE:20, AUTO:60, CAR:120, BIG_CAR:180, pool:40}
 *   - Inline display: "Pool & save ₹X per person • Yg less CO₂"
 */
import { describe, it, expect } from 'vitest';
import { calculateCO2, calculateFare } from '../setup.js';

describe('1.4 — Savings Comparison', () => {
    describe('Fare savings for pooled rides', () => {
        it('should discount pooled fare by ~33%', () => {
            const solo = calculateFare(10, 'CAR', false);
            const pooled = calculateFare(10, 'CAR', true);
            expect(pooled / solo).toBeCloseTo(0.67, 1);
        });

        it('should compute positive ₹ saved', () => {
            const solo = calculateFare(10, 'CAR', false);
            const pooled = calculateFare(10, 'CAR', true);
            expect(solo - pooled).toBeGreaterThan(0);
        });

        it('should discount across all vehicle categories', () => {
            for (const cat of['BIKE', 'AUTO', 'CAR', 'BIG_CAR']) {
                const solo = calculateFare(10, cat, false);
                const pooled = calculateFare(10, cat, true);
                expect(pooled).toBeLessThan(solo);
            }
        });
    });

    describe('CO₂ savings for pooled rides', () => {
        it('should use pool rate 40 g/km instead of CAR 120 g/km', () => {
            expect(calculateCO2(10, 'CAR', false)).toBe(1200);
            expect(calculateCO2(10, 'CAR', true)).toBe(400);
        });

        it('should compute co2Saved = solo − pooled', () => {
            const saved = calculateCO2(10, 'CAR', false) - calculateCO2(10, 'CAR', true);
            expect(saved).toBe(800);
        });
    });
});