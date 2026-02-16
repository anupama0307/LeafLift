/**
 * Test 3.2 — CO₂ Saved Calculation
 * Tests calculateCO2Saved() — difference between solo and pool emissions.
 *
 * IMPLEMENTED in PlanRideScreen.tsx:
 *   - co2Saved = calculateCO2(distMeters, vehicleCategory) - calculateCO2(distMeters, 'pool')
 *   - Ride model: co2Saved field
 */
import { describe, it, expect } from 'vitest';
import { calculateCO2, calculateCO2Saved } from '../setup.js';

describe('3.2 — CO₂ Saved Calculation', () => {
    it('should compute saved CO₂ as solo minus pool emission', () => {
        const distKm = 10;
        const saved = calculateCO2Saved(distKm, 'CAR');
        // solo = 10 * 120 = 1200g, pool = 10 * 40 = 400g → saved = 800g
        expect(saved).toBe(800);
    });

    it('should show higher savings for BIG_CAR', () => {
        const saved = calculateCO2Saved(10, 'BIG_CAR');
        // solo = 10 * 180 = 1800g, pool = 400g → 1400g
        expect(saved).toBe(1400);
    });

    it('should show lower savings for AUTO', () => {
        const saved = calculateCO2Saved(10, 'AUTO');
        // solo = 10 * 60 = 600g, pool = 400g → 200g
        expect(saved).toBe(200);
    });

    it('should show zero savings for BIKE (pool emits more)', () => {
        const saved = calculateCO2Saved(10, 'BIKE');
        // solo = 10 * 20 = 200g, pool = 400g → clamped to 0
        expect(saved).toBe(0);
    });

    it('should scale linearly with distance', () => {
        const saved5km = calculateCO2Saved(5, 'CAR');
        const saved10km = calculateCO2Saved(10, 'CAR');
        expect(saved10km).toBe(saved5km * 2);
    });
});