/**
 * Test 4.7 — Sustainability Impact Analytics
 * Tests the environmental metrics calculation.
 *
 * User Story 4.7: As an admin, I want to see sustainability metrics
 * to measure environmental impact of pooled rides.
 */
import { describe, it, expect } from 'vitest';
import {
    CO2_RATES,
    POOL_RATE,
    calculateAggregateCO2,
    aggregateMonthlySustainability,
    createMockRide
} from '../setup.js';

describe('4.7 — Sustainability Impact Analytics', () => {

    describe('4.7.1 — Environmental Stats Dashboard', () => {
        it('should have CO2 rates for all vehicle categories', () => {
            expect(CO2_RATES.BIKE).toBeDefined();
            expect(CO2_RATES.AUTO).toBeDefined();
            expect(CO2_RATES.CAR).toBeDefined();
            expect(CO2_RATES.BIG_CAR).toBeDefined();
        });

        it('should have pool rate defined', () => {
            expect(POOL_RATE).toBeDefined();
            expect(POOL_RATE).toBeLessThan(CO2_RATES.CAR);
        });

        it('should track CO2 emissions per ride', () => {
            const ride = createMockRide({
                vehicleCategory: 'CAR',
                distance: '10 km',
                co2Emissions: CO2_RATES.CAR * 10
            });

            expect(ride.co2Emissions).toBe(1200);
        });

        it('should track CO2 saved for pooled rides', () => {
            const savedPerKm = CO2_RATES.CAR - POOL_RATE;
            const ride = createMockRide({
                isPooled: true,
                distance: '10 km',
                co2Saved: savedPerKm * 10
            });

            expect(ride.co2Saved).toBe(800);
        });
    });

    describe('4.7.2 — Aggregate CO2 Computation', () => {
        it('should sum total CO2 saved', () => {
            const rides = [
                createMockRide({ co2Saved: 100 }),
                createMockRide({ co2Saved: 200 }),
                createMockRide({ co2Saved: 150 }),
            ];

            const result = calculateAggregateCO2(rides);
            expect(result.totalSaved).toBe(450);
        });

        it('should sum total CO2 emitted', () => {
            const rides = [
                createMockRide({ co2Emissions: 500 }),
                createMockRide({ co2Emissions: 300 }),
            ];

            const result = calculateAggregateCO2(rides);
            expect(result.totalEmitted).toBe(800);
        });

        it('should calculate net reduction percentage', () => {
            const rides = [
                createMockRide({ co2Emissions: 1000, co2Saved: 200 }),
                createMockRide({ co2Emissions: 500, co2Saved: 300 }),
            ];

            const result = calculateAggregateCO2(rides);
            // 500 saved / (1500 emitted + 500 saved) = 25%
            expect(result.netReduction).toBe(25);
        });

        it('should handle zero emissions', () => {
            const result = calculateAggregateCO2([]);
            expect(result.netReduction).toBe(0);
        });

        it('should handle rides with undefined co2 values', () => {
            const rides = [
                createMockRide({ co2Emissions: undefined, co2Saved: undefined }),
                createMockRide({ co2Emissions: 100, co2Saved: 50 }),
            ];

            const result = calculateAggregateCO2(rides);
            expect(result.totalEmitted).toBe(100);
            expect(result.totalSaved).toBe(50);
        });
    });

    describe('4.7.3 — Monthly Sustainability Trends', () => {
        it('should aggregate by month', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), co2Saved: 100 }),
                createMockRide({ createdAt: new Date('2024-02-15'), co2Saved: 200 }),
            ];

            const result = aggregateMonthlySustainability(rides);
            expect(result.length).toBe(2);
        });

        it('should track pooling contribution separately', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), isPooled: true, co2Saved: 100 }),
                createMockRide({ createdAt: new Date('2024-01-16'), isPooled: false, co2Saved: 50 }),
            ];

            const result = aggregateMonthlySustainability(rides);
            expect(result[0].poolingSaved).toBe(100);
        });

        it('should calculate trees equivalent', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), co2Saved: 220 }),
            ];

            const result = aggregateMonthlySustainability(rides);
            expect(result[0].treesEquivalent).toBe(10);
        });

        it('should count green trips', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), co2Saved: 100 }),
                createMockRide({ createdAt: new Date('2024-01-16'), co2Saved: 0 }),
                createMockRide({ createdAt: new Date('2024-01-17'), co2Saved: 50 }),
            ];

            const result = aggregateMonthlySustainability(rides);
            expect(result[0].greenTrips).toBe(2);
        });

        it('should show improvement trend over months', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), co2Saved: 100 }),
                createMockRide({ createdAt: new Date('2024-02-15'), co2Saved: 200 }),
                createMockRide({ createdAt: new Date('2024-03-15'), co2Saved: 300 }),
            ];

            const result = aggregateMonthlySustainability(rides);

            expect(result[0].co2Saved).toBeLessThan(result[1].co2Saved);
            expect(result[1].co2Saved).toBeLessThan(result[2].co2Saved);
        });
    });

    describe('Integration: Complete sustainability dashboard', () => {
        it('should provide comprehensive environmental impact summary', () => {
            const rides = [];

            // Generate 3 months of data with increasing sustainability
            const months = ['2024-01', '2024-02', '2024-03'];
            months.forEach((month, idx) => {
                for (let i = 0; i < 30; i++) {
                    const isPooled = Math.random() > (0.7 - idx * 0.1);
                    const co2Emissions = 500 + Math.random() * 500;
                    const co2Saved = isPooled ? co2Emissions * 0.3 : 0;

                    rides.push(createMockRide({
                        createdAt: new Date(`${month}-${String(i + 1).padStart(2, '0')}`),
                        isPooled,
                        co2Emissions,
                        co2Saved
                    }));
                }
            });

            const aggregate = calculateAggregateCO2(rides);
            const monthly = aggregateMonthlySustainability(rides);

            expect(aggregate.totalSaved).toBeGreaterThan(0);
            expect(monthly).toHaveLength(3);
        });

        it('should calculate sustainability score', () => {
            const rides = [
                createMockRide({ co2Emissions: 1000, co2Saved: 400, isPooled: true }),
                createMockRide({ co2Emissions: 800, co2Saved: 320, isPooled: true }),
                createMockRide({ co2Emissions: 600, co2Saved: 0, isPooled: false }),
            ];

            const aggregate = calculateAggregateCO2(rides);
            const pooledRides = rides.filter(r => r.isPooled).length;
            const poolRate = pooledRides / rides.length * 100;

            // Calculate sustainability score (weighted average)
            const sustainabilityScore = Math.round(
                (aggregate.netReduction * 0.6) + (poolRate * 0.4)
            );

            expect(sustainabilityScore).toBeGreaterThan(0);
            expect(sustainabilityScore).toBeLessThanOrEqual(100);
        });
    });
});