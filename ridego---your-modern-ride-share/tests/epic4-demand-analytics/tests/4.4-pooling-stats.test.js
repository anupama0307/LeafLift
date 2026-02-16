/**
 * Test 4.4 — Pooling Statistics
 * Tests the pooling success rate computation.
 *
 * User Story 4.4: As an admin, I want to see pooling success rates
 * to measure how well the pooling algorithm performs.
 */
import { describe, it, expect } from 'vitest';
import {
    computePoolingSuccessRate,
    aggregateMonthlyPooling,
    createMockRide
} from '../setup.js';

describe('4.4 — Pooling Success Analytics', () => {

    describe('4.4.1 — Pooling Statistics Widget', () => {
        it('should track pool ride requests', () => {
            const rides = [
                createMockRide({ isPooled: true, status: 'COMPLETED' }),
                createMockRide({ isPooled: true, status: 'COMPLETED' }),
                createMockRide({ isPooled: true, status: 'CANCELED' }),
            ];

            const poolRequests = rides.filter(r => r.isPooled);
            expect(poolRequests.length).toBe(3);
        });

        it('should distinguish pool from solo rides', () => {
            const rides = [
                createMockRide({ isPooled: true }),
                createMockRide({ isPooled: false }),
                createMockRide({ isPooled: true }),
            ];

            const pooled = rides.filter(r => r.isPooled);
            const solo = rides.filter(r => !r.isPooled);

            expect(pooled.length).toBe(2);
            expect(solo.length).toBe(1);
        });
    });

    describe('4.4.2 — Success Rate Computation', () => {
        it('should compute success rate as percentage', () => {
            const rate = computePoolingSuccessRate(80, 100);
            expect(rate).toBe(80);
        });

        it('should handle zero total requests', () => {
            const rate = computePoolingSuccessRate(0, 0);
            expect(rate).toBe(0);
        });

        it('should return decimal precision', () => {
            const rate = computePoolingSuccessRate(33, 100);
            expect(rate).toBe(33);
        });

        it('should handle 100% success rate', () => {
            const rate = computePoolingSuccessRate(50, 50);
            expect(rate).toBe(100);
        });

        it('should handle very low success rate', () => {
            const rate = computePoolingSuccessRate(1, 100);
            expect(rate).toBe(1);
        });

        it('should compute from ride data', () => {
            const rides = [
                createMockRide({ isPooled: true, status: 'COMPLETED' }),
                createMockRide({ isPooled: true, status: 'COMPLETED' }),
                createMockRide({ isPooled: true, status: 'CANCELED' }),
                createMockRide({ isPooled: true, status: 'CANCELED' }),
            ];

            const pooled = rides.filter(r => r.isPooled);
            const completed = pooled.filter(r => r.status === 'COMPLETED').length;
            const rate = computePoolingSuccessRate(completed, pooled.length);

            expect(rate).toBe(50);
        });
    });

    describe('4.4.3 — Monthly Success Rate Trends', () => {
        it('should aggregate by month', () => {
            const rides = [
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-01-15') }),
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-01-20') }),
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-02-15') }),
            ];

            const monthly = aggregateMonthlyPooling(rides);
            expect(monthly.length).toBe(2);
        });

        it('should include month name in result', () => {
            const rides = [
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-03-15') }),
            ];

            const monthly = aggregateMonthlyPooling(rides);
            expect(monthly[0].month).toBe('Mar');
        });

        it('should exclude non-pooled rides from statistics', () => {
            const rides = [
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-01-15') }),
                createMockRide({ isPooled: false, status: 'COMPLETED', createdAt: new Date('2024-01-16') }),
            ];

            const monthly = aggregateMonthlyPooling(rides);
            expect(monthly[0].totalRequests).toBe(1);
        });

        it('should handle empty data', () => {
            const monthly = aggregateMonthlyPooling([]);
            expect(monthly).toHaveLength(0);
        });

        it('should calculate success rate trend over time', () => {
            const rides = [
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-01-15') }),
                createMockRide({ isPooled: true, status: 'CANCELED', createdAt: new Date('2024-01-16') }),
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-02-15') }),
                createMockRide({ isPooled: true, status: 'COMPLETED', createdAt: new Date('2024-02-16') }),
            ];

            const monthly = aggregateMonthlyPooling(rides);

            expect(monthly[0].successRate).toBe(50);
            expect(monthly[1].successRate).toBe(100);
        });
    });
});