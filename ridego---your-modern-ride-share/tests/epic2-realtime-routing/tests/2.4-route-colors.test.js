/**
 * Test 2.4 — Route Color by Ride Status
 * Tests getRouteColor() used in PlanRideScreen.tsx for map polyline styling.
 *
 * IMPLEMENTED in PlanRideScreen.tsx:
 *   - Route polyline color changes based on ride status
 */
import { describe, it, expect } from 'vitest';
import { getRouteColor } from '../setup.js';

describe('2.4 — Route Color by Ride Status', () => {
    it('should return blue for ACCEPTED', () => {
        expect(getRouteColor('ACCEPTED')).toBe('#3B82F6');
    });

    it('should return blue for ARRIVED', () => {
        expect(getRouteColor('ARRIVED')).toBe('#3B82F6');
    });

    it('should return green for IN_PROGRESS', () => {
        expect(getRouteColor('IN_PROGRESS')).toBe('#22C55E');
    });

    it('should return gray for SEARCHING', () => {
        expect(getRouteColor('SEARCHING')).toBe('#6B7280');
    });

    it('should return gray for COMPLETED', () => {
        expect(getRouteColor('COMPLETED')).toBe('#6B7280');
    });
});