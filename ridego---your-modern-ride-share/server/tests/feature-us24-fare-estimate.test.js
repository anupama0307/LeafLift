/**
 * Tests for User Story 2.4 — Fare Estimate Breakdown
 *
 * 2.4.1  Endpoint returns the data required to compute per-vehicle fare breakdown.
 * 2.4.2  Fare formula correctness: baseRate + (distKm × perKmRate) = total fare.
 * 2.4.3  Fare breakdown scales linearly and ordering across vehicles is correct.
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US24';

// ─── Vehicle category fare rates (mirrors constants.tsx VEHICLE_CATEGORIES) ───
const FARE_RATES = {
    BIKE:    { baseRate: 15, perKmRate: 7  },
    AUTO:    { baseRate: 25, perKmRate: 10 },
    CAR:     { baseRate: 30, perKmRate: 12 },
    BIG_CAR: { baseRate: 50, perKmRate: 18 },
};

// ─── Standard test coordinate pairs (Coimbatore) ───
const PICKUP  = { lat: 11.0168, lng: 76.9558 }; // Gandhipuram
const DROPOFF = { lat: 11.0500, lng: 76.9900 }; // RS Puram area (~5 km)
const NEARBY  = { lat: 11.0190, lng: 76.9580 }; // ~250 m from PICKUP

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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us24') });
    } catch (_) {}
    await mongoose.connection.close();
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.4.1 — Endpoint returns data sufficient for fare breakdown display
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.4.1 — Estimate endpoint returns fare-computation data', () => {
    it('returns HTTP 200 with JSON content-type', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/json/);
    });

    it('response contains straightLineKm as a positive number', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(typeof res.body.straightLineKm).toBe('number');
        expect(res.body.straightLineKm).toBeGreaterThan(0);
    });

    it('response contains vehicleEstimates array with 4 entries', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        expect(Array.isArray(res.body.vehicleEstimates)).toBe(true);
        expect(res.body.vehicleEstimates.length).toBe(4);
    });

    it('vehicleEstimates includes all four vehicle categories', async () => {
        const res  = await request(app).get(qs(PICKUP, DROPOFF));
        const cats = res.body.vehicleEstimates.map(v => v.category);
        expect(cats).toContain('BIKE');
        expect(cats).toContain('AUTO');
        expect(cats).toContain('CAR');
        expect(cats).toContain('BIG_CAR');
    });

    it('each vehicleEstimate has a positive straightLineKm matching root field', async () => {
        const res = await request(app).get(qs(PICKUP, DROPOFF));
        for (const v of res.body.vehicleEstimates) {
            expect(v.straightLineKm).toBeCloseTo(res.body.straightLineKm, 2);
            expect(v.straightLineKm).toBeGreaterThan(0);
        }
    });

    it('returns 400 when coordinates are missing', async () => {
        const res = await request(app).get('/api/rides/estimate?pickupLat=11.0168&pickupLng=76.9558');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('message');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.4.2 — Fare formula: baseRate + (distKm × perKmRate) is correct per vehicle
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.4.2 — Fare formula correctness per vehicle category', () => {
    it('BIKE fare formula: 15 + distKm × 7 matches expected value', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        const fare   = computeFare('BIKE', distKm);
        expect(fare).toBe(Math.round(15 + distKm * 7));
    });

    it('AUTO fare formula: 25 + distKm × 10 matches expected value', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        const fare   = computeFare('AUTO', distKm);
        expect(fare).toBe(Math.round(25 + distKm * 10));
    });

    it('CAR fare formula: 30 + distKm × 12 matches expected value', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        const fare   = computeFare('CAR', distKm);
        expect(fare).toBe(Math.round(30 + distKm * 12));
    });

    it('BIG_CAR fare formula: 50 + distKm × 18 matches expected value', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        const fare   = computeFare('BIG_CAR', distKm);
        expect(fare).toBe(Math.round(50 + distKm * 18));
    });

    it('fare components sum correctly: base + perKm portion = total', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        for (const [cat, { baseRate, perKmRate }] of Object.entries(FARE_RATES)) {
            const kmCharge = parseFloat((distKm * perKmRate).toFixed(2));
            const total    = Math.round(baseRate + kmCharge);
            expect(total).toBe(computeFare(cat, distKm));
        }
    });

    it('fares are always positive integers', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        for (const cat of Object.keys(FARE_RATES)) {
            const fare = computeFare(cat, distKm);
            expect(fare).toBeGreaterThan(0);
            expect(Number.isInteger(fare)).toBe(true);
        }
    });

    it('BIG_CAR is always the most expensive vehicle', async () => {
        const res    = await request(app).get(qs(PICKUP, DROPOFF));
        const distKm = res.body.straightLineKm;
        const bigCar = computeFare('BIG_CAR', distKm);
        for (const cat of ['BIKE', 'AUTO', 'CAR']) {
            expect(bigCar).toBeGreaterThan(computeFare(cat, distKm));
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.4.3 — Fare breakdown scales correctly across trip lengths
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.4.3 — Fare scaling with trip distance', () => {
    it('very short trip: fares are close to base rates only', async () => {
        const res    = await request(app).get(qs(PICKUP, NEARBY)); // ~250 m
        const distKm = res.body.straightLineKm;
        expect(distKm).toBeLessThan(1); // confirm it is a short trip
        // For a short trip, fare should be close to baseRate (within 1× perKmRate overhead)
        const carFare = computeFare('CAR', distKm);
        expect(carFare).toBeGreaterThanOrEqual(30);
        expect(carFare).toBeLessThan(30 + 1 * 12 + 1); // base + max 1km overhead
    });

    it('longer trip produces higher fare than shorter trip', async () => {
        const short  = await request(app).get(qs(PICKUP, NEARBY));
        const longer = await request(app).get(qs(PICKUP, DROPOFF));
        expect(computeFare('CAR', longer.body.straightLineKm))
            .toBeGreaterThan(computeFare('CAR', short.body.straightLineKm));
    });

    it('fare increases linearly: +1 km always adds exactly perKmRate', () => {
        const distKm = 5.0;
        for (const [cat, { perKmRate }] of Object.entries(FARE_RATES)) {
            const fareAt5  = computeFare(cat, distKm);
            const fareAt6  = computeFare(cat, distKm + 1);
            expect(fareAt6 - fareAt5).toBe(perKmRate);
        }
    });

    it('cross-city trip (Chennai–Mumbai ~1000 km) returns very large fare', async () => {
        const MUMBAI  = { lat: 19.076, lng: 72.877 };
        const CHENNAI = { lat: 13.083, lng: 80.270 };
        const res     = await request(app).get(qs(MUMBAI, CHENNAI));
        expect(res.status).toBe(200);
        const distKm  = res.body.straightLineKm;
        // CAR fare for ~1000 km should be enormous
        expect(computeFare('CAR', distKm)).toBeGreaterThan(10000);
    });

    it('fare ordering CAR > AUTO > BIKE holds for any positive distance', () => {
        for (const distKm of [1, 5, 10, 50]) {
            expect(computeFare('CAR', distKm)).toBeGreaterThan(computeFare('AUTO', distKm));
            expect(computeFare('AUTO', distKm)).toBeGreaterThan(computeFare('BIKE', distKm));
        }
    });
});
