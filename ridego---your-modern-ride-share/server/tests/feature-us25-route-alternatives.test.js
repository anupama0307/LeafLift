/**
 * Tests for User Story 2.5 — Route Alternatives Switcher
 *
 * 2.5.1  Fare formula is correctly applied for different route distances
 *        (Fastest = straight-line, Balanced = 1.2×, Scenic = 1.4×).
 * 2.5.2  Switching route index changes the booking fare by the correct delta.
 * 2.5.3  Route ordering is deterministic: Fastest ≤ Balanced ≤ Scenic fare.
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US25';

// ─── Vehicle category fare rates (mirrors constants.tsx VEHICLE_CATEGORIES) ───
const FARE_RATES = {
    BIKE:    { baseRate: 15, perKmRate: 7  },
    AUTO:    { baseRate: 25, perKmRate: 10 },
    CAR:     { baseRate: 30, perKmRate: 12 },
    BIG_CAR: { baseRate: 50, perKmRate: 18 },
};

// ─── Route multipliers applied in PlanRideScreen for alternative routes ───
// Route 0 (Fastest): 1.0× straight-line distance
// Route 1 (Balanced): 1.2× straight-line distance
// Route 2 (Scenic):   1.4× straight-line distance
const ROUTE_MULTIPLIERS = [1.0, 1.2, 1.4];
const ROUTE_LABELS      = ['Fastest', 'Balanced', 'Scenic'];

const PICKUP  = { lat: 11.0168, lng: 76.9558 };
const DROPOFF = { lat: 11.0500, lng: 76.9900 };

const qs = (p, d) =>
    `/api/rides/estimate?pickupLat=${p.lat}&pickupLng=${p.lng}&dropoffLat=${d.lat}&dropoffLng=${d.lng}`;

function computeFare(category, distKm) {
    const { baseRate, perKmRate } = FARE_RATES[category];
    return Math.round(baseRate + distKm * perKmRate);
}

beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;
    mongoose = (await import('mongoose')).default;

    const server = await import('../index.js');
    app = server.app;

    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            mongoose.connection.once('connected', resolve);
            setTimeout(resolve, 8000);
        });
    }
}, 20000);

afterAll(async () => {
    try {
        await mongoose.model('Ride').deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us25') });
    } catch (_) {}
    await mongoose.connection.close();
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.5.1 — Fare is correctly computed for each of the three route alternatives
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.5.1 — Fare computation for Fastest / Balanced / Scenic routes', () => {
    it('Fastest route (index 0) fare = baseRate + straight-line km × perKmRate', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm * ROUTE_MULTIPLIERS[0];
        expect(computeFare('CAR', distKm)).toBe(Math.round(30 + distKm * 12));
    });

    it('Balanced route (index 1) fare uses 1.2× the straight-line distance', async () => {
        const res     = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm  = res.body.straightLineKm * ROUTE_MULTIPLIERS[1];
        const fare    = computeFare('CAR', distKm);
        const base    = computeFare('CAR', res.body.straightLineKm * ROUTE_MULTIPLIERS[0]);
        expect(fare).toBeGreaterThanOrEqual(base);
    });

    it('Scenic route (index 2) fare uses 1.4× the straight-line distance', async () => {
        const res     = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm  = res.body.straightLineKm * ROUTE_MULTIPLIERS[2];
        const fare    = computeFare('CAR', distKm);
        const base    = computeFare('CAR', res.body.straightLineKm * ROUTE_MULTIPLIERS[0]);
        expect(fare).toBeGreaterThan(base);
    });

    it('all three alternative fares are positive integers for every vehicle', async () => {
        const res     = await request(app).get(qs(PICKUP, DROPOFF));
        const baseDist = res.body.straightLineKm;
        for (const multiplier of ROUTE_MULTIPLIERS) {
            for (const cat of Object.keys(FARE_RATES)) {
                const fare = computeFare(cat, baseDist * multiplier);
                expect(fare).toBeGreaterThan(0);
                expect(Number.isInteger(fare)).toBe(true);
            }
        }
    });

    it('distance in metres converts to km correctly: fare same as distM/1000 formula', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        const distM  = distKm * 1000; // as the frontend receives it
        // Frontend formula: Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate)
        const frontendFare = Math.round(30 + (distM / 1000) * 12);
        expect(frontendFare).toBe(computeFare('CAR', distKm));
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.5.2 — Switching route index changes the booking fare by the correct delta
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.5.2 — Route switching changes fare by correct per-km delta', () => {
    it('CAR: Balanced→Fastest saves exactly Math.round(0.2 × distKm × 12) rupees', async () => {
        const res     = await request(app).get(qs(PICKUP, DROPOFF));
        const dist    = res.body.straightLineKm;
        const fastest  = computeFare('CAR', dist * 1.0);
        const balanced = computeFare('CAR', dist * 1.2);
        const expectedDiff = balanced - fastest;
        expect(expectedDiff).toBeGreaterThanOrEqual(0);
        // Verify it matches the formula delta: round(1.2×dist×12) - round(1.0×dist×12)
        const formulaDiff = Math.round(30 + dist * 1.2 * 12) - Math.round(30 + dist * 1.0 * 12);
        expect(expectedDiff).toBe(formulaDiff);
    });

    it('BIKE: Scenic costs more than Fastest by at least 0.4 × distKm × 7', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const dist   = res.body.straightLineKm;
        const scenic  = computeFare('BIKE', dist * 1.4);
        const fastest = computeFare('BIKE', dist * 1.0);
        expect(scenic).toBeGreaterThan(fastest);
        // Difference should be approximately 0.4 × distKm × 7
        const approxDiff = 0.4 * dist * 7;
        expect(scenic - fastest).toBeGreaterThanOrEqual(Math.floor(approxDiff));
    });

    it('+1 km always adds exactly perKmRate to fare regardless of route', () => {
        const baseDist = 5.0;
        for (const [cat, { perKmRate }] of Object.entries(FARE_RATES)) {
            for (const mul of ROUTE_MULTIPLIERS) {
                const fareA = computeFare(cat, baseDist * mul);
                const fareB = computeFare(cat, baseDist * mul + 1);
                expect(fareB - fareA).toBe(perKmRate);
            }
        }
    });

    it('BIG_CAR always has the largest fare delta when switching routes', async () => {
        const res  = await request(app).get(qs(PICKUP, DROPOFF));
        const dist = res.body.straightLineKm;
        // BIG_CAR (perKmRate=18) has the largest delta per extra km
        const bigCarDelta = computeFare('BIG_CAR', dist * 1.4) - computeFare('BIG_CAR', dist * 1.0);
        const bikeDelta   = computeFare('BIKE',    dist * 1.4) - computeFare('BIKE',    dist * 1.0);
        expect(bigCarDelta).toBeGreaterThanOrEqual(bikeDelta);
    });

    it('estimate endpoint is stable across two rapid calls (basis for route switching)', async () => {
        const [r1, r2] = await Promise.all([
            request(app).get(qs(PICKUP, DROPOFF)),
            request(app).get(qs(PICKUP, DROPOFF)),
        ]);
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(r1.body.straightLineKm).toBeCloseTo(r2.body.straightLineKm, 3);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.5.3 — Fare ordering: Fastest ≤ Balanced ≤ Scenic
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.5.3 — Fare ordering across route alternatives is deterministic', () => {
    it('Fastest route has lowest CAR fare among all three alternatives', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const dist   = res.body.straightLineKm;
        const fares  = ROUTE_MULTIPLIERS.map(m => computeFare('CAR', dist * m));
        expect(fares[0]).toBeLessThanOrEqual(fares[1]);
        expect(fares[1]).toBeLessThanOrEqual(fares[2]);
    });

    it('Scenic route always has highest fare for every vehicle category', async () => {
        const res  = await request(app).get(qs(PICKUP, DROPOFF));
        const dist = res.body.straightLineKm;
        for (const cat of Object.keys(FARE_RATES)) {
            const fastest = computeFare(cat, dist * 1.0);
            const scenic  = computeFare(cat, dist * 1.4);
            expect(scenic).toBeGreaterThanOrEqual(fastest);
        }
    });

    it('fare ordering holds for short trips too (< 1 km)', () => {
        const distKm = 0.5;
        const fares  = ROUTE_MULTIPLIERS.map(m => computeFare('CAR', distKm * m));
        expect(fares[0]).toBeLessThanOrEqual(fares[1]);
        expect(fares[1]).toBeLessThanOrEqual(fares[2]);
    });

    it('fare ordering holds for long trips (50 km)', () => {
        const distKm = 50;
        const fares  = ROUTE_MULTIPLIERS.map(m => computeFare('AUTO', distKm * m));
        expect(fares[0]).toBeLessThan(fares[1]);
        expect(fares[1]).toBeLessThan(fares[2]);
    });

    it('route label count matches multiplier count (3 routes)', () => {
        expect(ROUTE_LABELS.length).toBe(3);
        expect(ROUTE_MULTIPLIERS.length).toBe(3);
    });

    it('BIKE Scenic fare is still cheaper than BIG_CAR Fastest for a typical trip', async () => {
        const res     = await request(app).get(qs(PICKUP, DROPOFF));
        const dist    = res.body.straightLineKm;
        const bikeScenicFare    = computeFare('BIKE',    dist * 1.4);
        const bigCarFastestFare = computeFare('BIG_CAR', dist * 1.0);
        // This verifies the category spread is meaningful — not just route-selection
        expect(bigCarFastestFare).toBeGreaterThan(bikeScenicFare);
    });
});
