/**
 * Test 4.2 — Peak Hours Detection
 * Tests the peak hour identification algorithm.
 *
 * User Story 4.2: As an admin, I want to detect peak hours
 * so that I can plan for high-demand periods.
 */
import { describe, it, expect } from 'vitest';
import {
    aggregateByHour,
    calculatePeakThreshold,
    flagPeakHours,
    chartYMax,
    DASHBOARD_HOURLY_BASE,
    createMockRide
} from '../setup.js';

describe('4.2 — Peak Hours Detection', () => {

    describe('4.2.1 — Aggregate by Time of Day', () => {
        it('should return 24 hour slots', () => {
            const rides = [];
            const result = aggregateByHour(rides);
            expect(result).toHaveLength(24);
        });

        it('should count rides per hour correctly', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15T09:00:00') }),
                createMockRide({ createdAt: new Date('2024-01-15T09:30:00') }),
                createMockRide({ createdAt: new Date('2024-01-15T10:00:00') }),
            ];
            const result = aggregateByHour(rides);
            expect(result[9].count).toBe(2);
            expect(result[10].count).toBe(1);
        });

        it('should handle empty rides array', () => {
            const result = aggregateByHour([]);
            expect(result.every(h => h.count === 0)).toBe(true);
        });

        it('should return hour property for each slot', () => {
            const result = aggregateByHour([]);
            result.forEach((slot, i) => {
                expect(slot.hour).toBe(i);
            });
        });
    });

    describe('4.2.2 — Statistical Threshold Calculation', () => {
        it('should calculate threshold using mean + std deviation', () => {
            const hourlyCounts = [
                { hour: 0, count: 10 },
                { hour: 1, count: 10 },
                { hour: 2, count: 10 },
                { hour: 9, count: 50 },
                { hour: 18, count: 60 },
            ];
            const threshold = calculatePeakThreshold(hourlyCounts);
            expect(threshold).toBeGreaterThan(10);
            expect(threshold).toBeLessThan(60);
        });

        it('should return 0 for empty data', () => {
            const threshold = calculatePeakThreshold([]);
            expect(threshold).toBe(0);
        });

        it('should handle uniform distribution', () => {
            const hourlyCounts = Array(24).fill(null).map((_, i) => ({ hour: i, count: 10 }));
            const threshold = calculatePeakThreshold(hourlyCounts);
            expect(threshold).toBe(10);
        });

        it('should handle high variance data', () => {
            const hourlyCounts = [
                { hour: 9, count: 100 },
                { hour: 10, count: 0 },
                { hour: 11, count: 100 },
                { hour: 12, count: 0 },
            ];
            const threshold = calculatePeakThreshold(hourlyCounts);
            expect(threshold).toBeGreaterThan(50);
        });
    });

    describe('4.2.3 — Flag Peak Hours', () => {
        it('should flag hours above threshold as peak', () => {
            const hourlyCounts = [
                { hour: 8, count: 10 },
                { hour: 9, count: 50 },
                { hour: 10, count: 15 },
            ];
            const result = flagPeakHours(hourlyCounts, 20);
            expect(result[1].isPeak).toBe(true);
            expect(result[0].isPeak).toBe(false);
        });

        it('should include threshold in result', () => {
            const hourlyCounts = [{ hour: 0, count: 10 }];
            const result = flagPeakHours(hourlyCounts, 15);
            expect(result[0].threshold).toBe(15);
        });

        it('should preserve original hour and count', () => {
            const hourlyCounts = [{ hour: 9, count: 45 }];
            const result = flagPeakHours(hourlyCounts, 20);
            expect(result[0].hour).toBe(9);
            expect(result[0].count).toBe(45);
        });

        it('should handle edge case of count equal to threshold', () => {
            const hourlyCounts = [{ hour: 9, count: 20 }];
            const result = flagPeakHours(hourlyCounts, 20);
            expect(result[0].isPeak).toBe(false);
        });
    });

    describe('Integration: Full peak detection flow', () => {
        it('should identify typical morning and evening peaks', () => {
            const rides = [];
            // Morning rush (8-10)
            for (let i = 0; i < 30; i++) {
                rides.push(createMockRide({
                    createdAt: new Date(`2024-01-15T0${8 + (i % 2)}:${i % 60}:00`)
                }));
            }
            // Evening rush (17-19)
            for (let i = 0; i < 30; i++) {
                rides.push(createMockRide({
                    createdAt: new Date(`2024-01-15T${17 + (i % 2)}:${i % 60}:00`)
                }));
            }
            // Off-peak hours
            for (let i = 0; i < 10; i++) {
                rides.push(createMockRide({
                    createdAt: new Date(`2024-01-15T14:${i * 5}:00`)
                }));
            }

            const hourly = aggregateByHour(rides);
            const threshold = calculatePeakThreshold(hourly);
            const flagged = flagPeakHours(hourly, threshold);

            const peakHours = flagged.filter(h => h.isPeak).map(h => h.hour);
            expect(peakHours.some(h => h >= 8 && h <= 10)).toBe(true);
        });

        it('should handle days with no clear peaks', () => {
            const rides = [];
            for (let h = 0; h < 24; h++) {
                rides.push(createMockRide({ createdAt: new Date(`2024-01-15T${String(h).padStart(2, '0')}:30:00`) }));
            }

            const hourly = aggregateByHour(rides);
            const threshold = calculatePeakThreshold(hourly);
            const flagged = flagPeakHours(hourly, threshold);

            const peaks = flagged.filter(h => h.isPeak);
            expect(peaks.length).toBeLessThan(12);
        });
    });

    describe('Dashboard: Peak Hours with Fallback Data', () => {
        it('should flag hours 7-9 and 17-18 as peaks in dashboard base data', () => {
            const hourlyCounts = DASHBOARD_HOURLY_BASE.map((count, hour) => ({ hour, count }));
            const threshold = calculatePeakThreshold(hourlyCounts);
            const flagged = flagPeakHours(hourlyCounts, threshold);
            const peakHours = flagged.filter(h => h.isPeak).map(h => h.hour);
            expect(peakHours.some(h => h >= 7 && h <= 9)).toBe(true);
            expect(peakHours.some(h => h >= 17 && h <= 18)).toBe(true);
        });

        it('should compute chart y-axis max above the highest bar', () => {
            const yMax = chartYMax(DASHBOARD_HOURLY_BASE);
            const maxBar = Math.max(...DASHBOARD_HOURLY_BASE);
            expect(yMax).toBeGreaterThan(maxBar);
            expect(yMax).toBeCloseTo(maxBar * 1.1, 1);
        });

        it('should have early morning as lowest demand period', () => {
            const hourlyCounts = DASHBOARD_HOURLY_BASE.map((count, hour) => ({ hour, count }));
            const earlyMorning = hourlyCounts.filter(h => h.hour >= 1 && h.hour <= 4);
            const minEarlyMorning = Math.min(...earlyMorning.map(h => h.count));
            expect(minEarlyMorning).toBeLessThan(10);
        });
    });
});