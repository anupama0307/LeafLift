/**
 * Test 4.1 — Demand Forecasting
 * Tests the demand prediction algorithm and region selection.
 *
 * User Story 4.1: As an admin, I want to predict ride demand
 * so that resources can be allocated efficiently.
 *
 * IMPLEMENTED in admin/components/DemandScreen.tsx:
 *   - 4.1.1: Admin dashboard to select regions for demand forecasting
 *   - 4.1.2: Algorithm to predict demand based on historical data
 *   - 4.1.3: Visualize predicted high-demand zones on heatmap
 */
import { describe, it, expect } from 'vitest';
import {
    REGIONS,
    DASHBOARD_REGIONS,
    DASHBOARD_HOURLY_BASE,
    chartYMax,
    predictDemand,
    classifyHeatLevel,
    haversineDistance,
    createMockRide
} from '../setup.js';

describe('4.1 — Demand Forecasting', () => {

    describe('4.1.1 — Region Selection Dashboard', () => {
        it('should have predefined regions for Coimbatore', () => {
            expect(REGIONS).toBeDefined();
            expect(REGIONS.length).toBeGreaterThan(0);
        });

        it('should include RS Puram region', () => {
            const rsPuram = REGIONS.find(r => r.name === 'RS Puram');
            expect(rsPuram).toBeDefined();
            expect(rsPuram.lat).toBeCloseTo(11.0062, 2);
            expect(rsPuram.lng).toBeCloseTo(76.9495, 2);
        });

        it('should include Gandhipuram region', () => {
            const gandhipuram = REGIONS.find(r => r.name === 'Gandhipuram');
            expect(gandhipuram).toBeDefined();
            expect(gandhipuram.radius).toBeGreaterThan(0);
        });

        it('should have radius defined for each region', () => {
            REGIONS.forEach(region => {
                expect(region.radius).toBeDefined();
                expect(region.radius).toBeGreaterThan(0);
            });
        });

        it('should have unique region names', () => {
            const names = REGIONS.map(r => r.name);
            const uniqueNames = new Set(names);
            expect(uniqueNames.size).toBe(names.length);
        });
    });

    describe('4.1.2 — Demand Prediction Algorithm', () => {
        it('should return 0 for empty historical data', () => {
            const prediction = predictDemand([], 9, 1);
            expect(prediction).toBe(0);
        });

        it('should predict based on average when no pattern', () => {
            const historicalData = [
                { hour: 9, day: 1, count: 10 },
                { hour: 10, day: 1, count: 10 },
                { hour: 11, day: 1, count: 10 },
            ];
            const prediction = predictDemand(historicalData, 9, 1);
            expect(prediction).toBeGreaterThan(0);
        });

        it('should weight same-hour data more heavily', () => {
            const historicalData = [
                { hour: 9, day: 1, count: 50 },
                { hour: 9, day: 2, count: 60 },
                { hour: 10, day: 1, count: 10 },
                { hour: 10, day: 2, count: 10 },
            ];
            const predictionAt9 = predictDemand(historicalData, 9, 1);
            const predictionAt10 = predictDemand(historicalData, 10, 1);
            expect(predictionAt9).toBeGreaterThanOrEqual(predictionAt10);
        });

        it('should weight same-day data more heavily', () => {
            const historicalData = [
                { hour: 9, day: 1, count: 100 },
                { hour: 9, day: 2, count: 10 },
                { hour: 10, day: 1, count: 100 },
                { hour: 10, day: 2, count: 10 },
            ];
            const predictionDay1 = predictDemand(historicalData, 9, 1);
            const predictionDay2 = predictDemand(historicalData, 9, 2);
            expect(predictionDay1).toBeGreaterThanOrEqual(predictionDay2);
        });

        it('should never return negative predictions', () => {
            const historicalData = [
                { hour: 9, day: 1, count: 0 },
                { hour: 10, day: 1, count: 0 },
            ];
            const prediction = predictDemand(historicalData, 9, 1);
            expect(prediction).toBeGreaterThanOrEqual(0);
        });

        it('should apply recency bias to predictions', () => {
            const oldData = [
                { hour: 9, day: 1, count: 10 },
                { hour: 9, day: 1, count: 10 },
                { hour: 9, day: 1, count: 10 },
            ];
            const recentData = [
                { hour: 9, day: 1, count: 100 },
                { hour: 9, day: 1, count: 100 },
                { hour: 9, day: 1, count: 100 },
            ];
            const historicalData = [...oldData, ...recentData];
            const prediction = predictDemand(historicalData, 9, 1);
            expect(prediction).toBeGreaterThan(50);
        });
    });

    describe('4.1.3 — Heatmap Heat Level Classification', () => {
        it('should classify deficit > 10 as critical', () => {
            expect(classifyHeatLevel(15)).toBe('critical');
            expect(classifyHeatLevel(11)).toBe('critical');
        });

        it('should classify deficit 6-10 as high', () => {
            expect(classifyHeatLevel(10)).toBe('high');
            expect(classifyHeatLevel(6)).toBe('high');
        });

        it('should classify deficit 1-5 as medium', () => {
            expect(classifyHeatLevel(5)).toBe('medium');
            expect(classifyHeatLevel(1)).toBe('medium');
        });

        it('should classify deficit 0 or negative as low', () => {
            expect(classifyHeatLevel(0)).toBe('low');
            expect(classifyHeatLevel(-5)).toBe('low');
        });
    });

    describe('4.1.3 — Haversine Distance for Region Mapping', () => {
        const rsPuram = REGIONS.find(r => r.name === 'RS Puram');

        it('should calculate distance between two points', () => {
            const gandhipuram = REGIONS.find(r => r.name === 'Gandhipuram');
            const dist = haversineDistance(rsPuram.lat, rsPuram.lng, gandhipuram.lat, gandhipuram.lng);
            expect(dist).toBeGreaterThan(0);
            expect(dist).toBeLessThan(10);
        });

        it('should return 0 for same point', () => {
            const dist = haversineDistance(rsPuram.lat, rsPuram.lng, rsPuram.lat, rsPuram.lng);
            expect(dist).toBe(0);
        });

        it('should correctly identify points within region radius', () => {
            const nearbyLat = rsPuram.lat + 0.005;
            const nearbyLng = rsPuram.lng + 0.005;
            const dist = haversineDistance(rsPuram.lat, rsPuram.lng, nearbyLat, nearbyLng);
            expect(dist).toBeLessThan(rsPuram.radius);
        });
    });

    describe('Integration: Region demand aggregation', () => {
        it('should aggregate rides by region', () => {
            const rsPuram = REGIONS.find(r => r.name === 'RS Puram');

            const rides = [];
            for (let i = 0; i < 10; i++) {
                rides.push(createMockRide({
                    pickup: {
                        address: 'RS Puram',
                        lat: rsPuram.lat + (Math.random() - 0.5) * 0.01,
                        lng: rsPuram.lng + (Math.random() - 0.5) * 0.01
                    }
                }));
            }

            const ridesInRSPuram = rides.filter(r => {
                if (!r.pickup || r.pickup.lat == null || r.pickup.lng == null) {
                    return false;
                }



                const dist = haversineDistance(
                    rsPuram.lat,
                    rsPuram.lng,
                    r.pickup.lat,
                    r.pickup.lng
                );

                return dist < rsPuram.radius;
            });


            expect(ridesInRSPuram.length).toBe(10);
        });
    });

    describe('Dashboard Integration: Fallback Data Validation', () => {
        it('should classify all dashboard fallback regions correctly', () => {
            DASHBOARD_REGIONS.forEach(r => {
                const expected = r.heatLevel;
                const computed = classifyHeatLevel(r.deficit);
                expect(computed).toBe(expected);
            });
        });

        it('should identify critical zones with deficit > 10', () => {
            const critical = DASHBOARD_REGIONS.filter(r => r.heatLevel === 'critical');
            expect(critical.length).toBeGreaterThan(0);
            critical.forEach(r => expect(r.deficit).toBeGreaterThan(10));
        });

        it('should have at least one low-demand region', () => {
            const low = DASHBOARD_REGIONS.filter(r => r.heatLevel === 'low');
            expect(low.length).toBeGreaterThan(0);
            low.forEach(r => expect(r.deficit).toBeLessThanOrEqual(0));
        });

        it('should compute chart y-axis max at 1.1x peak value', () => {
            const maxCount = Math.max(...DASHBOARD_HOURLY_BASE);
            const yMax = chartYMax(DASHBOARD_HOURLY_BASE);
            expect(yMax).toBeCloseTo(maxCount * 1.1, 1);
            expect(yMax).toBeGreaterThan(maxCount);
        });

        it('should ensure tallest bar never exceeds ~91% of chart height', () => {
            const maxCount = Math.max(...DASHBOARD_HOURLY_BASE);
            const yMax = chartYMax(DASHBOARD_HOURLY_BASE);
            const tallestBarPercent = (maxCount / yMax) * 100;
            expect(tallestBarPercent).toBeLessThan(92);
            expect(tallestBarPercent).toBeGreaterThan(85);
        });

        it('should have 6 dashboard fallback regions', () => {
            expect(DASHBOARD_REGIONS).toHaveLength(6);
        });

        it('should have 24 hourly base values', () => {
            expect(DASHBOARD_HOURLY_BASE).toHaveLength(24);
        });
    });
});