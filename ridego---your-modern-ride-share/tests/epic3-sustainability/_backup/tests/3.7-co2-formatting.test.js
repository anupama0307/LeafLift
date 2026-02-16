/**
 * Test 3.7 — CO₂ Formatting Helpers
 * Tests formatCO2(), co2ToTrees(), getEnvironmentalScore().
 *
 * IMPLEMENTED in PlanRideScreen.tsx:
 *   - Displays "Yg less CO₂" inline
 *   - These helpers are used for UI formatting
 */
import { describe, it, expect } from 'vitest';
import { formatCO2, co2ToTrees, getEnvironmentalScore } from '../setup.js';

describe('3.7 — CO₂ Formatting Helpers', () => {
    describe('formatCO2()', () => {
        it('should format grams when < 1000', () => {
            expect(formatCO2(500)).toBe('500 g');
        });

        it('should format kilograms when ≥ 1000', () => {
            expect(formatCO2(1500)).toBe('1.5 kg');
        });

        it('should handle zero', () => {
            expect(formatCO2(0)).toBe('0 g');
        });
    });

    describe('co2ToTrees()', () => {
        it('should convert CO₂ grams to equivalent trees', () => {
            // 1 tree ≈ 22,000 g CO₂/year
            const trees = co2ToTrees(22000);
            expect(trees).toBeCloseTo(1, 0);
        });

        it('should return 0 for 0 grams', () => {
            expect(co2ToTrees(0)).toBe(0);
        });
    });

    describe('getEnvironmentalScore()', () => {
        it('should return A+ for high pooling rate', () => {
            expect(getEnvironmentalScore(80)).toBe('A+');
        });

        it('should return A for 60% pooling rate', () => {
            expect(getEnvironmentalScore(60)).toBe('A');
        });

        it('should return C for 30% pooling rate', () => {
            expect(getEnvironmentalScore(30)).toBe('C');
        });

        it('should return F for very low pooling rate', () => {
            expect(getEnvironmentalScore(10)).toBe('F');
        });
    });
});