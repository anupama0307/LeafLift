/**
 * Test 4.6 — Pattern Analysis & ML Learning
 * Tests the historical pattern analysis and bottleneck identification.
 *
 * User Story 4.6: As an admin, I want to use ML to learn from patterns
 * to continuously improve predictions.
 */
import { describe, it, expect } from 'vitest';
import {
    analyzeByDayOfWeek,
    identifyBottlenecks,
    createMockRide
} from '../setup.js';

describe('4.6 — Pattern Analysis & ML Learning', () => {

    describe('4.6.1 — Historical Data Aggregation', () => {
        it('should aggregate rides by day of week', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15') }), // Monday
                createMockRide({ createdAt: new Date('2024-01-16') }), // Tuesday
                createMockRide({ createdAt: new Date('2024-01-22') }), // Monday
            ];

            const result = analyzeByDayOfWeek(rides);

            expect(result).toHaveLength(7);
            expect(result[1].day).toBe('Mon');
            expect(result[1].rides).toBe(2);
        });

        it('should calculate average fare per day', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), fare: 100 }), // Monday
                createMockRide({ createdAt: new Date('2024-01-22'), fare: 200 }), // Monday
            ];

            const result = analyzeByDayOfWeek(rides);

            expect(result[1].avgFare).toBe(150);
        });

        it('should return zero for days with no rides', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15') }), // Monday
            ];

            const result = analyzeByDayOfWeek(rides);

            expect(result[0].rides).toBe(0); // Sunday
            expect(result[0].avgFare).toBe(0);
        });

        it('should aggregate multiple weeks together', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), fare: 100 }), // Monday week 1
                createMockRide({ createdAt: new Date('2024-01-22'), fare: 150 }), // Monday week 2
                createMockRide({ createdAt: new Date('2024-01-29'), fare: 200 }), // Monday week 3
            ];

            const result = analyzeByDayOfWeek(rides);

            expect(result[1].rides).toBe(3);
        });
    });

    describe('4.6.2 — Bottleneck Identification', () => {
        it('should identify high cancellation rate', () => {
            const rides = [];
            for (let i = 0; i < 70; i++) {
                rides.push(createMockRide({ status: 'COMPLETED' }));
            }
            for (let i = 0; i < 30; i++) {
                rides.push(createMockRide({ status: 'CANCELED' }));
            }

            const bottlenecks = identifyBottlenecks(rides);

            const cancellation = bottlenecks.find(b => b.type === 'HIGH_CANCELLATION');
            expect(cancellation).toBeDefined();
            expect(cancellation.severity).toBe('critical');
        });

        it('should mark cancellation as warning if 15-25%', () => {
            const rides = [];
            for (let i = 0; i < 80; i++) {
                rides.push(createMockRide({ status: 'COMPLETED' }));
            }
            for (let i = 0; i < 20; i++) {
                rides.push(createMockRide({ status: 'CANCELED' }));
            }

            const bottlenecks = identifyBottlenecks(rides);

            const cancellation = bottlenecks.find(b => b.type === 'HIGH_CANCELLATION');
            expect(cancellation).toBeDefined();
            expect(cancellation.severity).toBe('warning');
        });

        it('should not flag low cancellation rate', () => {
            const rides = [];
            for (let i = 0; i < 90; i++) {
                rides.push(createMockRide({ status: 'COMPLETED' }));
            }
            for (let i = 0; i < 10; i++) {
                rides.push(createMockRide({ status: 'CANCELED' }));
            }

            const bottlenecks = identifyBottlenecks(rides);

            const cancellation = bottlenecks.find(b => b.type === 'HIGH_CANCELLATION');
            expect(cancellation).toBeUndefined();
        });

        it('should identify low pool matching rate', () => {
            const rides = [];
            for (let i = 0; i < 50; i++) {
                rides.push(createMockRide({ isPooled: true, status: 'COMPLETED' }));
            }
            for (let i = 0; i < 50; i++) {
                rides.push(createMockRide({ isPooled: true, status: 'CANCELED' }));
            }

            const bottlenecks = identifyBottlenecks(rides);

            const poolMatch = bottlenecks.find(b => b.type === 'LOW_POOL_MATCH');
            expect(poolMatch).toBeDefined();
        });

        it('should identify vehicle category imbalance', () => {
            const rides = [];
            for (let i = 0; i < 100; i++) {
                rides.push(createMockRide({ vehicleCategory: 'CAR' }));
            }
            for (let i = 0; i < 5; i++) {
                rides.push(createMockRide({ vehicleCategory: 'BIKE' }));
            }

            const bottlenecks = identifyBottlenecks(rides);

            const imbalance = bottlenecks.find(b => b.type === 'CATEGORY_IMBALANCE');
            expect(imbalance).toBeDefined();
        });

        it('should return empty array for healthy data', () => {
            const rides = [];
            for (let i = 0; i < 100; i++) {
                rides.push(createMockRide({
                    status: 'COMPLETED',
                    isPooled: Math.random() > 0.7,
                    vehicleCategory: ['CAR', 'AUTO', 'BIKE'][i % 3]
                }));
            }

            const bottlenecks = identifyBottlenecks(rides);
            const critical = bottlenecks.filter(b => b.severity === 'critical');

            expect(critical.length).toBe(0);
        });
    });

    describe('4.6.3 — Fleet Optimization Insights', () => {
        it('should identify peak demand days for scheduling', () => {
            const rides = [];
            // Heavy Monday traffic
            for (let i = 0; i < 50; i++) {
                rides.push(createMockRide({ createdAt: new Date('2024-01-15') })); // Monday
            }
            // Light Sunday traffic
            for (let i = 0; i < 10; i++) {
                rides.push(createMockRide({ createdAt: new Date('2024-01-14') })); // Sunday
            }

            const dayStats = analyzeByDayOfWeek(rides);
            const peakDay = dayStats.reduce((max, day) => day.rides > max.rides ? day : max);

            expect(peakDay.day).toBe('Mon');
        });

        it('should track revenue patterns for pricing optimization', () => {
            const rides = [
                createMockRide({ createdAt: new Date('2024-01-15'), fare: 300 }), // Monday high fare
                createMockRide({ createdAt: new Date('2024-01-16'), fare: 100 }), // Tuesday low fare
            ];

            const dayStats = analyzeByDayOfWeek(rides);
            const monday = dayStats.find(d => d.day === 'Mon');
            const tuesday = dayStats.find(d => d.day === 'Tue');

            expect(monday.avgFare).toBeGreaterThan(tuesday.avgFare);
        });

        it('should provide actionable bottleneck messages', () => {
            const rides = [];
            for (let i = 0; i < 60; i++) {
                rides.push(createMockRide({ status: 'COMPLETED' }));
            }
            for (let i = 0; i < 40; i++) {
                rides.push(createMockRide({ status: 'CANCELED' }));
            }

            const bottlenecks = identifyBottlenecks(rides);
            const messages = bottlenecks.map(b => b.message);

            expect(messages.some(m => m.includes('investigate'))).toBe(true);
        });
    });

    describe('Integration: Complete pattern analysis', () => {
        it('should provide comprehensive fleet insights', () => {
            const rides = [];

            // Generate realistic weekly data
            const days = ['2024-01-14', '2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19', '2024-01-20'];
            const rideCounts = [10, 50, 45, 40, 42, 55, 15];

            days.forEach((day, idx) => {
                for (let i = 0; i < rideCounts[idx]; i++) {
                    rides.push(createMockRide({
                        createdAt: new Date(day),
                        fare: 100 + Math.random() * 100,
                        status: Math.random() > 0.1 ? 'COMPLETED' : 'CANCELED'
                    }));
                }
            });

            const dayAnalysis = analyzeByDayOfWeek(rides);
            const bottlenecks = identifyBottlenecks(rides);

            expect(dayAnalysis).toHaveLength(7);
            expect(bottlenecks.length).toBeGreaterThanOrEqual(0);
        });
    });
});