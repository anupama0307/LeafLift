/**
 * Test 4.3 — Driver Surge Management
 * Tests the surge detection and notification system.
 *
 * User Story 4.3: As an admin, I want to monitor areas with driver shortage
 * so that I can notify drivers to reposition.
 */
import { describe, it, expect } from 'vitest';
import {
    monitorZoneDemand,
    createSurgeNotification,
    classifyHeatLevel,
    REGIONS,
    DASHBOARD_REGIONS,
    createMockNotification
} from '../setup.js';

describe('4.3 — Driver Surge Management', () => {

    describe('4.3.1 — Monitor Zone Demand vs Drivers', () => {
        it('should identify when more drivers are needed', () => {
            const result = monitorZoneDemand(50, 5);
            expect(result.needsDrivers).toBe(true);
            expect(result.deficit).toBeGreaterThan(0);
        });

        it('should return no deficit when drivers adequate', () => {
            const result = monitorZoneDemand(20, 10);
            expect(result.needsDrivers).toBe(false);
            expect(result.deficit).toBe(0);
        });

        it('should calculate deficit correctly', () => {
            const result = monitorZoneDemand(100, 10);
            expect(result.deficit).toBe(10);
        });

        it('should use default ratio of 5 rides per driver', () => {
            const result = monitorZoneDemand(25, 4);
            expect(result.deficit).toBe(1);
        });

        it('should never return negative deficit', () => {
            const result = monitorZoneDemand(10, 100);
            expect(result.deficit).toBe(0);
        });

        it('should calculate surge multiplier based on deficit', () => {
            expect(monitorZoneDemand(100, 0).surgeMultiplier).toBe(2.5);
            expect(monitorZoneDemand(60, 0).surgeMultiplier).toBe(2.0);
            expect(monitorZoneDemand(40, 0).surgeMultiplier).toBe(1.5);
            expect(monitorZoneDemand(15, 0).surgeMultiplier).toBe(1.2);
            expect(monitorZoneDemand(5, 5).surgeMultiplier).toBe(1.0);
        });
    });

    describe('4.3.2 — Surge Notifications', () => {
        it('should create notification with zone name', () => {
            const notification = createSurgeNotification('RS Puram', 10, 2.0);
            expect(notification.title).toBe('RS Puram');
        });

        it('should include deficit in high surge message', () => {
            const notification = createSurgeNotification('RS Puram', 15, 2.5);
            expect(notification.message).toContain('15');
            expect(notification.message).toContain('2.5x');
        });

        it('should show surge bonus for medium surge', () => {
            const notification = createSurgeNotification('Gandhipuram', 8, 1.5);
            expect(notification.message).toContain('1.5x');
            expect(notification.message).toContain('bonus');
        });

        it('should show gentle prompt for low surge', () => {
            const notification = createSurgeNotification('Peelamedu', 2, 1.2);
            expect(notification.message).toContain('Go online');
        });

        it('should create notification documents in database', () => {
            const mockNotif = createMockNotification({
                title: 'RS Puram',
                message: 'High demand!',
                type: 'ALERT'
            });
            expect(mockNotif.title).toBe('RS Puram');
            expect(mockNotif.type).toBe('ALERT');
        });

        it('should broadcast to multiple drivers', () => {
            const notifications = [];
            const driverIds = ['d1', 'd2', 'd3'];

            driverIds.forEach(driverId => {
                notifications.push(createMockNotification({
                    userId: driverId,
                    title: 'Surge Alert',
                    message: 'High demand in RS Puram'
                }));
            });

            expect(notifications).toHaveLength(3);
            expect(new Set(notifications.map(n => n.userId)).size).toBe(3);
        });
    });

    describe('4.3.3 — Surge Area Highlighting', () => {
        it('should classify critical heat level for high deficit', () => {
            const heatLevel = classifyHeatLevel(15);
            expect(heatLevel).toBe('critical');
        });

        it('should classify high heat level for moderate deficit', () => {
            const heatLevel = classifyHeatLevel(8);
            expect(heatLevel).toBe('high');
        });

        it('should classify medium heat level for small deficit', () => {
            const heatLevel = classifyHeatLevel(3);
            expect(heatLevel).toBe('medium');
        });

        it('should classify low heat level when no deficit', () => {
            const heatLevel = classifyHeatLevel(0);
            expect(heatLevel).toBe('low');
        });

        it('should map regions to heat levels based on demand', () => {
            const regionsDemand = REGIONS.slice(0, 4).map((region, i) => ({
                ...region,
                demand: 50 + i * 20,
                drivers: 5
            }));

            const heatLevels = regionsDemand.map(r => {
                const { deficit } = monitorZoneDemand(r.demand, r.drivers);
                return { name: r.name, heatLevel: classifyHeatLevel(deficit) };
            });

            expect(heatLevels.some(h => h.heatLevel === 'critical')).toBe(true);
        });
    });

    describe('Integration: End-to-end surge management', () => {
        it('should trigger notifications when demand exceeds threshold', () => {
            const regionDemand = { name: 'RS Puram', demand: 100, drivers: 5 };
            const { needsDrivers, deficit, surgeMultiplier } = monitorZoneDemand(
                regionDemand.demand,
                regionDemand.drivers
            );

            if (needsDrivers) {
                const notification = createSurgeNotification(
                    regionDemand.name,
                    deficit,
                    surgeMultiplier
                );
                expect(notification.message.length).toBeGreaterThan(0);
            }

            expect(needsDrivers).toBe(true);
        });

        it('should not send notifications when demand is low', () => {
            const regionDemand = { name: 'Ukkadam', demand: 10, drivers: 10 };
            const { needsDrivers } = monitorZoneDemand(
                regionDemand.demand,
                regionDemand.drivers
            );

            expect(needsDrivers).toBe(false);
        });
    });

    describe('Dashboard: Surge with Fallback Regions', () => {
        it('should correctly evaluate T. Nagar with ratio-based surge detection', () => {
            const tNagar = DASHBOARD_REGIONS.find(r => r.name === 'T. Nagar');
            // T. Nagar: 48 rides, 22 drivers → required = ceil(48/5) = 10, deficit = 0
            // Dashboard deficit (26) is rides - drivers, but monitorZoneDemand uses ratio
            const { needsDrivers, deficit } = monitorZoneDemand(tNagar.rides, tNagar.drivers);
            expect(needsDrivers).toBe(false); // 22 drivers > 10 required
            expect(deficit).toBe(0);
        });

        it('should detect surge when dashboard demand is extreme', () => {
            // Simulate a region with very high demand vs drivers
            const { needsDrivers, surgeMultiplier } = monitorZoneDemand(120, 5);
            expect(needsDrivers).toBe(true);
            expect(surgeMultiplier).toBe(2.5);
        });

        it('should not trigger surge for Anna Nagar (surplus)', () => {
            const annaNagar = DASHBOARD_REGIONS.find(r => r.name === 'Anna Nagar');
            const { needsDrivers } = monitorZoneDemand(annaNagar.rides, annaNagar.drivers);
            expect(needsDrivers).toBe(false);
        });

        it('should classify dashboard regions heat levels correctly', () => {
            DASHBOARD_REGIONS.forEach(r => {
                const computed = classifyHeatLevel(r.deficit);
                expect(computed).toBe(r.heatLevel);
            });
        });

        it('should generate surge notifications for extreme demand scenarios', () => {
            const extremeRegions = [
                { name: 'Central', demand: 200, drivers: 5 },
                { name: 'Station', demand: 150, drivers: 3 },
            ];
            const notifications = extremeRegions.map(r => {
                const { deficit, surgeMultiplier } = monitorZoneDemand(r.demand, r.drivers);
                return createSurgeNotification(r.name, deficit, surgeMultiplier);
            });
            expect(notifications.length).toBe(2);
            notifications.forEach(n => expect(n.message.length).toBeGreaterThan(0));
        });
    });
});