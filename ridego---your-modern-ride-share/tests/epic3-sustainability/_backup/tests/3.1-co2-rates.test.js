/**
 * Test 3.1 — CO₂ Emission Rates per Vehicle
 * Tests the CO₂ emission constants used in calculateCO2().
 *
 * IMPLEMENTED in PlanRideScreen.tsx:
 *   - CO₂ rates: BIKE:20, AUTO:60, CAR:120, BIG_CAR:180 (g/km)
 *   - Pool rate: 40 g/km
 */
import { describe, it, expect } from 'vitest';
import { CO2_RATES, POOL_RATE, calculateCO2 } from '../setup.js';

describe('3.1 — CO₂ Emission Rates', () => {
    it('should have correct rate for BIKE (20 g/km)', () => {
        expect(CO2_RATES.BIKE).toBe(20);
    });

    it('should have correct rate for AUTO (60 g/km)', () => {
        expect(CO2_RATES.AUTO).toBe(60);
    });

    it('should have correct rate for CAR (120 g/km)', () => {
        expect(CO2_RATES.CAR).toBe(120);
    });

    it('should have correct rate for BIG_CAR (180 g/km)', () => {
        expect(CO2_RATES.BIG_CAR).toBe(180);
    });

    it('should have pool rate of 40 g/km', () => {
        expect(POOL_RATE).toBe(40);
    });

    it('should compute emission = km × rate', () => {
        // 10 km by CAR → 10 * 120 = 1200g
        expect(calculateCO2(10, 'CAR')).toBe(1200);
    });

    it('should default to CAR rate for unknown type', () => {
        expect(calculateCO2(5, 'UNKNOWN')).toBe(600); // 5 * 120
    });
});