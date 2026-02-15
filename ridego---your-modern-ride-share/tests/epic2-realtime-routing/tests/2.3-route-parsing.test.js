/**
 * Test 2.3 — OLA API Route Response Parsing
 * Tests parseOlaRouteResponse() which extracts distance, duration, polyline
 * from the OLA Directions API response format.
 *
 * IMPLEMENTED in server/index.js:
 *   - POST /api/ola/directions → response parsed on client side
 *   - PlanRideScreen.tsx uses response.routes[].legs[0].distance/duration
 */
import { describe, it, expect } from 'vitest';
import { parseOlaRouteResponse } from '../setup.js';

describe('2.3 — OLA Route Response Parsing', () => {
    it('should parse routes with distance, duration, polyline', () => {
        const mockResponse = {
            routes: [{
                legs: [{ distance: { text: '10.2 km', value: 10200 }, duration: { text: '25 min', value: 1500 } }],
                overview_polyline: 'abc123',
            }],
        };

        const parsed = parseOlaRouteResponse(mockResponse);
        expect(parsed.length).toBe(1);
        expect(parsed[0].distance).toBe('10.2 km');
        expect(parsed[0].distanceMeters).toBe(10200);
        expect(parsed[0].duration).toBe('25 min');
        expect(parsed[0].durationSeconds).toBe(1500);
        expect(parsed[0].polyline).toBe('abc123');
    });

    it('should handle multiple alternative routes', () => {
        const mockResponse = {
            routes: [
                { legs: [{ distance: { text: '10 km', value: 10000 }, duration: { text: '20 min', value: 1200 } }], overview_polyline: 'route1' },
                { legs: [{ distance: { text: '12 km', value: 12000 }, duration: { text: '18 min', value: 1080 } }], overview_polyline: 'route2' },
            ],
        };

        const parsed = parseOlaRouteResponse(mockResponse);
        expect(parsed.length).toBe(2);
        expect(parsed[0].index).toBe(0);
        expect(parsed[1].index).toBe(1);
    });

    it('should return empty array for null/invalid response', () => {
        expect(parseOlaRouteResponse(null)).toEqual([]);
        expect(parseOlaRouteResponse({})).toEqual([]);
        expect(parseOlaRouteResponse({ routes: [] })).toEqual([]);
    });
});