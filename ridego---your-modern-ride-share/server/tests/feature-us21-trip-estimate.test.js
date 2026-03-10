/**
 * Tests for User Story 2.1 — Trip distance & duration before booking
 *
 * 2.1.1  Calculate straight-line distance between pickup and dropoff coordinates.
 * 2.1.2  Return distance (km) and estimated duration (minutes) per vehicle category.
 * 2.1.3  The endpoint is reachable before any ride is booked (no auth required).
 */

let app, request;

beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;
    const server = await import('../index.js');
    app = server.app;
});

// Coimbatore city coords used as reference
const PICKUP  = { lat: 11.0168, lng: 76.9558 }; // Gandhipuram
const DROPOFF = { lat: 11.0500, lng: 76.9900 }; // RS Puram
// Haversine between these two ≈ 4.6–5.1 km (straight line)

const BASE = '/api/rides/estimate';

const qs = (p, d) =>
    `${BASE}?pickupLat=${p.lat}&pickupLng=${p.lng}&dropoffLat=${d.lat}&dropoffLng=${d.lng}`;

// ══════════════════════════════════════════════════════════════════════════════
// US 2.1.1 — Straight-line distance calculation
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.1.1 — Straight-line distance (Haversine)', () => {
    it('GET /api/rides/estimate returns 200', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.status).toBe(200);
    });

    it('response contains straightLineKm', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(typeof res.body.straightLineKm).toBe('number');
    });

    it('straightLineKm is a positive number', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.body.straightLineKm).toBeGreaterThan(0);
    });

    it('straightLineKm between Gandhipuram and RS Puram is between 4 and 7 km', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.body.straightLineKm).toBeGreaterThanOrEqual(4);
        expect(res.body.straightLineKm).toBeLessThanOrEqual(7);
    });

    it('same-point query returns straightLineKm ≈ 0', async () => {
        const res = await request(app).get(qs(PICKUP, PICKUP));
        expect(res.status).toBe(200);
        expect(res.body.straightLineKm).toBeCloseTo(0, 0);
    });

    it('returns 400 when pickupLat is missing', async () => {
        const res = await request(app).get(
            `${BASE}?pickupLng=${PICKUP.lng}&dropoffLat=${DROPOFF.lat}&dropoffLng=${DROPOFF.lng}`
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when dropoffLng is missing', async () => {
        const res = await request(app).get(
            `${BASE}?pickupLat=${PICKUP.lat}&pickupLng=${PICKUP.lng}&dropoffLat=${DROPOFF.lat}`
        );
        expect(res.status).toBe(400);
    });

    it('returns 400 when a coordinate is non-numeric', async () => {
        const res = await request(app).get(
            `${BASE}?pickupLat=abc&pickupLng=${PICKUP.lng}&dropoffLat=${DROPOFF.lat}&dropoffLng=${DROPOFF.lng}`
        );
        expect(res.status).toBe(400);
    });

    it('distance is symmetric (A→B ≈ B→A)', async () => {
        const fwd = await request(app).get(qs(PICKUP, DROPOFF));
        const rev = await request(app).get(qs(DROPOFF, PICKUP));
        expect(fwd.body.straightLineKm).toBeCloseTo(rev.body.straightLineKm, 1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.1.2 — Distance (km) and estimated duration (min) returned
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.1.2 — Distance and duration in response', () => {
    it('response contains estimatedDurationMin', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(typeof res.body.estimatedDurationMin).toBe('number');
    });

    it('estimatedDurationMin is at least 1 min', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.body.estimatedDurationMin).toBeGreaterThanOrEqual(1);
    });

    it('estimatedDurationMin is a positive integer', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(Number.isInteger(res.body.estimatedDurationMin)).toBe(true);
        expect(res.body.estimatedDurationMin).toBeGreaterThan(0);
    });

    it('response contains vehicleEstimates array', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(Array.isArray(res.body.vehicleEstimates)).toBe(true);
        expect(res.body.vehicleEstimates.length).toBeGreaterThan(0);
    });

    it('vehicleEstimates includes BIKE, AUTO, CAR, BIG_CAR categories', async () => {
        const res   = await request(app).get(qs(PICKUP, DROPOFF));
        const cats  = res.body.vehicleEstimates.map(v => v.category);
        expect(cats).toContain('BIKE');
        expect(cats).toContain('AUTO');
        expect(cats).toContain('CAR');
        expect(cats).toContain('BIG_CAR');
    });

    it('each vehicleEstimate has estimatedDurationMin ≥ 1', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        for (const v of res.body.vehicleEstimates) {
            expect(v.estimatedDurationMin).toBeGreaterThanOrEqual(1);
        }
    });

    it('each vehicleEstimate has straightLineKm matching root field', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        for (const v of res.body.vehicleEstimates) {
            expect(v.straightLineKm).toBeCloseTo(res.body.straightLineKm, 2);
        }
    });

    it('BIKE duration > CAR duration (slower speed assumption)', async () => {
        const res  = await request(app).get(qs(PICKUP, DROPOFF));
        const bike = res.body.vehicleEstimates.find(v => v.category === 'BIKE');
        const car  = res.body.vehicleEstimates.find(v => v.category === 'CAR');
        expect(bike.estimatedDurationMin).toBeGreaterThanOrEqual(car.estimatedDurationMin);
    });

    it('each vehicleEstimate has co2EmittedG ≥ 0', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        for (const v of res.body.vehicleEstimates) {
            expect(v.co2EmittedG).toBeGreaterThanOrEqual(0);
        }
    });

    it('BIKE has the lowest co2EmittedG (cleanest vehicle)', async () => {
        const res  = await request(app).get(qs(PICKUP, DROPOFF));
        const bike = res.body.vehicleEstimates.find(v => v.category === 'BIKE');
        for (const v of res.body.vehicleEstimates) {
            expect(bike.co2EmittedG).toBeLessThanOrEqual(v.co2EmittedG);
        }
    });

    it('response contains a human-readable note field', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(typeof res.body.note).toBe('string');
        expect(res.body.note.length).toBeGreaterThan(0);
    });

    it('longer trip returns proportionally higher durationMin', async () => {
        const NEAR   = { lat: 11.017, lng: 76.956 };
        const FAR    = { lat: 11.090, lng: 77.040 };
        const short  = await request(app).get(qs(PICKUP, NEAR));
        const longer = await request(app).get(qs(PICKUP, FAR));
        expect(longer.body.estimatedDurationMin).toBeGreaterThan(short.body.estimatedDurationMin);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.1.3 — Endpoint accessible before booking (no auth required)
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.1.3 — No authentication required for estimate endpoint', () => {
    it('returns 200 without any Authorization header', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/json/);
    });

    it('works with far-apart coordinates (cross-city)', async () => {
        const MUMBAI   = { lat: 19.076, lng: 72.877 };
        const CHENNAI  = { lat: 13.083, lng: 80.270 };
        const res = await request(app).get(qs(MUMBAI, CHENNAI));
        expect(res.status).toBe(200);
        // straight-line Mumbai–Chennai ≈ 1000–1100 km
        expect(res.body.straightLineKm).toBeGreaterThan(800);
    });

    it('works for very short trip (< 1 km)', async () => {
        const A = { lat: 11.0168, lng: 76.9558 };
        const B = { lat: 11.0175, lng: 76.9565 };  // ~100 m away
        const res = await request(app).get(qs(A, B));
        expect(res.status).toBe(200);
        expect(res.body.straightLineKm).toBeGreaterThan(0);
        expect(res.body.straightLineKm).toBeLessThan(1);
    });

    it('response is JSON', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.headers['content-type']).toMatch(/json/);
    });
});
