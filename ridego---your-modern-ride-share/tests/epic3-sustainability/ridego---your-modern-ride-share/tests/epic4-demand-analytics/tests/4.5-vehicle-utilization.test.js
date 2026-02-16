/**
 * Test 4.5 — Vehicle Utilization Reports
 * Tests the vehicle utilization computation and reporting.
 *
 * User Story 4.5: As an admin, I want to see vehicle utilization reports
 * to understand fleet efficiency.
 */
import { describe, it, expect } from 'vitest';
import {
    computeUtilization,
    aggregateVehicleUtilization,
    generateUtilizationCSV,
    createMockRide
} from '../setup.js';

describe('4.5 — Vehicle Utilization Reports', () => {

    describe('4.5.1 — Report Timeframe Selection', () => {
        it('should filter rides by today', () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            const rides = [
                createMockRide({ createdAt: today }),
                createMockRide({ createdAt: yesterday }),
            ];

            const todayStart = new Date(today.setHours(0, 0, 0, 0));
            const filtered = rides.filter(r => new Date(r.createdAt) >= todayStart);
            expect(filtered.length).toBe(1);
        });

        it('should filter rides by week', () => {
            const now = new Date();
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            const twoWeeksAgo = new Date(now);
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            const rides = [
                createMockRide({ createdAt: now }),
                createMockRide({ createdAt: weekAgo }),
                createMockRide({ createdAt: twoWeeksAgo }),
            ];

            const filtered = rides.filter(r => new Date(r.createdAt) >= weekAgo);
            expect(filtered.length).toBe(2);
        });

        it('should filter rides by month', () => {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

            const rides = [
                createMockRide({ createdAt: now }),
                createMockRide({ createdAt: lastMonth }),
            ];

            const filtered = rides.filter(r => new Date(r.createdAt) >= monthStart);
            expect(filtered.length).toBe(1);
        });
    });

    describe('4.5.2 — Utilization Percentage Computation', () => {
        it('should compute utilization as percentage', () => {
            const util = computeUtilization(12, 24);
            expect(util).toBe(50);
        });

        it('should handle full utilization', () => {
            const util = computeUtilization(24, 24);
            expect(util).toBe(100);
        });

        it('should handle zero utilization', () => {
            const util = computeUtilization(0, 24);
            expect(util).toBe(0);
        });

        it('should handle division by zero', () => {
            const util = computeUtilization(10, 0);
            expect(util).toBe(0);
        });

        it('should return decimal precision', () => {
            const util = computeUtilization(1, 3);
            expect(util).toBeCloseTo(33.3, 1);
        });
    });

    describe('4.5.2 — Vehicle Category Aggregation', () => {
        it('should aggregate by vehicle category', () => {
            const rides = [
                createMockRide({ vehicleCategory: 'CAR', status: 'COMPLETED', driverId: 'd1' }),
                createMockRide({ vehicleCategory: 'CAR', status: 'COMPLETED', driverId: 'd2' }),
                createMockRide({ vehicleCategory: 'BIKE', status: 'COMPLETED', driverId: 'd3' }),
            ];
            const fleet = { BIKE: 10, AUTO: 10, CAR: 10, BIG_CAR: 5 };

            const result = aggregateVehicleUtilization(rides, fleet);

            const carResult = result.find(r => r.category === 'CAR');
            const bikeResult = result.find(r => r.category === 'BIKE');

            expect(carResult.completedRides).toBe(2);
            expect(bikeResult.completedRides).toBe(1);
        });

        it('should calculate active vehicles from unique drivers', () => {
            const rides = [
                createMockRide({ vehicleCategory: 'CAR', driverId: 'd1' }),
                createMockRide({ vehicleCategory: 'CAR', driverId: 'd1' }),
                createMockRide({ vehicleCategory: 'CAR', driverId: 'd2' }),
            ];
            const fleet = { CAR: 10, BIKE: 5, AUTO: 5, BIG_CAR: 5 };

            const result = aggregateVehicleUtilization(rides, fleet);
            const carResult = result.find(r => r.category === 'CAR');

            expect(carResult.active).toBe(2);
        });

        it('should sum total kilometers', () => {
            const rides = [
                createMockRide({ vehicleCategory: 'CAR', status: 'COMPLETED', distance: '10 km' }),
                createMockRide({ vehicleCategory: 'CAR', status: 'COMPLETED', distance: '15 km' }),
            ];
            const fleet = { CAR: 10, BIKE: 5, AUTO: 5, BIG_CAR: 5 };

            const result = aggregateVehicleUtilization(rides, fleet);
            const carResult = result.find(r => r.category === 'CAR');

            expect(carResult.totalKm).toBe(25);
        });

        it('should calculate average revenue per ride', () => {
            const rides = [
                createMockRide({ vehicleCategory: 'AUTO', status: 'COMPLETED', fare: 100 }),
                createMockRide({ vehicleCategory: 'AUTO', status: 'COMPLETED', fare: 200 }),
            ];
            const fleet = { CAR: 10, BIKE: 5, AUTO: 5, BIG_CAR: 5 };

            const result = aggregateVehicleUtilization(rides, fleet);
            const autoResult = result.find(r => r.category === 'AUTO');

            expect(autoResult.avgRevenue).toBe(150);
        });

        it('should count completed rides only for revenue', () => {
            const rides = [
                createMockRide({ vehicleCategory: 'BIKE', status: 'COMPLETED', fare: 50 }),
                createMockRide({ vehicleCategory: 'BIKE', status: 'CANCELED', fare: 0 }),
            ];
            const fleet = { CAR: 10, BIKE: 5, AUTO: 5, BIG_CAR: 5 };

            const result = aggregateVehicleUtilization(rides, fleet);
            const bikeResult = result.find(r => r.category === 'BIKE');

            expect(bikeResult.completedRides).toBe(1);
        });
    });

    describe('4.5.3 — Report Export', () => {
        it('should generate CSV header', () => {
            const csv = generateUtilizationCSV([], 'Today');
            expect(csv).toContain('Vehicle Type');
            expect(csv).toContain('Utilization %');
        });

        it('should include all vehicle data in CSV', () => {
            const data = [
                { type: 'Car', category: 'CAR', total: 10, active: 5, utilization: 50, completedRides: 20, totalKm: 100, avgRevenue: 150 },
            ];
            const csv = generateUtilizationCSV(data, 'Today');
            expect(csv).toContain('Car');
            expect(csv).toContain('50');
        });

        it('should format CSV with proper delimiters', () => {
            const data = [
                { type: 'Bike', category: 'BIKE', total: 20, active: 10, utilization: 50, completedRides: 30, totalKm: 200, avgRevenue: 75 },
            ];
            const csv = generateUtilizationCSV(data, 'Week');
            const lines = csv.split('\n');
            expect(lines[1].split(',').length).toBe(7);
        });

        it('should handle empty data', () => {
            const csv = generateUtilizationCSV([], 'Month');
            expect(csv).toContain('Vehicle Type');
        });
    });

    describe('Integration: Full utilization report', () => {
        it('should generate complete utilization report', () => {
            const rides = [
                createMockRide({ vehicleCategory: 'CAR', status: 'COMPLETED', distance: '10 km', fare: 200, driverId: 'd1' }),
                createMockRide({ vehicleCategory: 'CAR', status: 'COMPLETED', distance: '8 km', fare: 160, driverId: 'd2' }),
                createMockRide({ vehicleCategory: 'BIKE', status: 'COMPLETED', distance: '5 km', fare: 50, driverId: 'd3' }),
                createMockRide({ vehicleCategory: 'AUTO', status: 'CANCELED', driverId: 'd4' }),
            ];
            const fleet = { BIKE: 15, AUTO: 20, CAR: 25, BIG_CAR: 10 };

            const utilization = aggregateVehicleUtilization(rides, fleet);
            const csv = generateUtilizationCSV(utilization, 'Today');

            expect(utilization).toHaveLength(4);
            expect(csv.length).toBeGreaterThan(100);
        });
    });
});