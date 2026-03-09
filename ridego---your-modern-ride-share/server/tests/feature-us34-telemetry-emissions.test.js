/**
 * Tests for User Story 3.4 — Telemetry-based emission calculation
 * 3.4.1 Collect ride telemetry data (distance, vehicle type)
 * 3.4.2 Apply emission formulas for precise carbon output
 * 3.4.3 Store calculated emission values in ride DB
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US34';

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
});

afterAll(async () => {
    try {
        await mongoose.model('Ride').deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
    } catch (_) {}
});

// Helper: create an IN_PROGRESS ride for telemetry testing
async function makeActiveRide(vehicleCategory = 'CAR', isPooled = false) {
    return new (mongoose.model('Ride'))({
        userId:   new mongoose.Types.ObjectId(),
        pickup:   { address: `${TEST_TAG} Start`, lat: 28.6139, lng: 77.2090 },
        dropoff:  { address: `${TEST_TAG} End`,   lat: 28.7041, lng: 77.1025 },
        status:   'IN_PROGRESS',
        vehicleCategory,
        isPooled,
        fare: 150,
        currentFare: 150,
    }).save();
}

// ── 3.4.1 — Collect Ride Telemetry Data ──────────────────────────────────────
describe('US 3.4.1 — Collect Ride Telemetry Data', () => {
    it('POST /telemetry returns 400 when lat/lng are missing', async () => {
        const ride = await makeActiveRide();
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ speed: 30 });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/lat and lng/i);
    });

    it('POST /telemetry returns 404 for unknown rideId', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .post(`/api/rides/${fakeId}/telemetry`)
            .send({ lat: 28.6, lng: 77.2 });
        expect(res.status).toBe(404);
    });

    it('first telemetry point records distanceFromPrev = 0', async () => {
        const ride = await makeActiveRide();
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6139, lng: 77.2090, speed: 0 });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.distanceFromPrevMeters).toBe(0);
        expect(res.body.telemetryPointsCount).toBe(1);
    });

    it('second ping accumulates distance from previous point', async () => {
        const ride = await makeActiveRide();
        await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6139, lng: 77.2090 });
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6639, lng: 77.2090 }); // ~5.6 km north
        expect(res.status).toBe(200);
        expect(res.body.distanceFromPrevMeters).toBeGreaterThan(0);
        expect(res.body.telemetryDistanceMeters).toBeGreaterThan(0);
        expect(res.body.telemetryPointsCount).toBe(2);
    });

    it('telemetryPointsCount grows with each successive ping', async () => {
        const ride = await makeActiveRide();
        for (let i = 0; i < 3; i++) {
            const res = await request(app)
                .post(`/api/rides/${ride._id}/telemetry`)
                .send({ lat: 28.6 + i * 0.05, lng: 77.2 });
            expect(res.body.telemetryPointsCount).toBe(i + 1);
        }
    });

    it('GET /telemetry returns summary with pointsCount and accumulated distance', async () => {
        const ride = await makeActiveRide();
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.2 });
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.65, lng: 77.2 });
        const res = await request(app).get(`/api/rides/${ride._id}/telemetry`);
        expect(res.status).toBe(200);
        expect(res.body.telemetryPointsCount).toBe(2);
        expect(res.body.telemetryDistanceMeters).toBeGreaterThan(0);
        expect(res.body).toHaveProperty('vehicleCategory');
        expect(res.body).toHaveProperty('emissionRateGPerKm');
    });

    it('GET /telemetry returns 404 for unknown rideId', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(`/api/rides/${fakeId}/telemetry`);
        expect(res.status).toBe(404);
    });

    it('POST /telemetry returns 409 for a completed (non-active) ride', async () => {
        const ride = await new (mongoose.model('Ride'))({
            userId:   new mongoose.Types.ObjectId(),
            pickup:   { address: `${TEST_TAG} Done`, lat: 28.6, lng: 77.2 },
            dropoff:  { address: `${TEST_TAG} End`,  lat: 28.7, lng: 77.3 },
            status:   'COMPLETED',
            vehicleCategory: 'CAR',
            fare: 100,
        }).save();
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6, lng: 77.2 });
        expect(res.status).toBe(409);
    });
});

// ── 3.4.2 — Apply Emission Formulas ──────────────────────────────────────────
describe('US 3.4.2 — Apply Emission Formulas for Precise Carbon Output', () => {
    it('CAR ride exposes emission rate of 120 g/km', async () => {
        const ride = await makeActiveRide('CAR');
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6, lng: 77.2 });
        expect(res.status).toBe(200);
        expect(res.body.emissionRateGPerKm).toBe(120);
    });

    it('BIKE ride exposes emission rate of 21 g/km', async () => {
        const ride = await makeActiveRide('BIKE');
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6, lng: 77.2 });
        expect(res.status).toBe(200);
        expect(res.body.emissionRateGPerKm).toBe(21);
    });

    it('emissionSource is TELEMETRY after first ping', async () => {
        const ride = await makeActiveRide();
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6, lng: 77.2 });
        expect(res.body.emissionSource).toBe('TELEMETRY');
    });

    it('first ping (no previous point) has co2EmittedG = 0', async () => {
        const ride = await makeActiveRide();
        const res = await request(app)
            .post(`/api/rides/${ride._id}/telemetry`)
            .send({ lat: 28.6, lng: 77.2 });
        // distanceFromPrev = 0 on first point → telemetryDistanceMeters = 0 → CO2 = 0
        expect(res.body.co2EmittedG).toBe(0);
    });

    it('co2EmittedG = round(telemetryDistKm × emissionRateGPerKm)', async () => {
        const ride = await makeActiveRide('CAR');
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        const res = await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.70, lng: 77.20 });
        expect(res.status).toBe(200);
        const expectedCo2 = Math.round((res.body.telemetryDistanceMeters / 1000) * res.body.emissionRateGPerKm);
        expect(res.body.co2EmittedG).toBe(expectedCo2);
    });

    it('pooled ride: co2SavedG equals co2EmittedG', async () => {
        const ride = await makeActiveRide('CAR', true);
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        const res = await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.70, lng: 77.20 });
        expect(res.body.co2SavedG).toBe(res.body.co2EmittedG);
    });

    it('GET /telemetry shows emissionRateGPerKm = 65 for AUTO', async () => {
        const ride = await makeActiveRide('AUTO');
        const res = await request(app).get(`/api/rides/${ride._id}/telemetry`);
        expect(res.status).toBe(200);
        expect(res.body.emissionRateGPerKm).toBe(65);
    });
});

// ── 3.4.3 — Store Emission Values in Ride DB ─────────────────────────────────
describe('US 3.4.3 — Persist Calculated Emission Values to DB', () => {
    it('co2Emissions persisted in DB after telemetry pings', async () => {
        const ride = await makeActiveRide('CAR');
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.70, lng: 77.20 });
        const dbRide = await mongoose.model('Ride').findById(ride._id);
        expect(dbRide.co2Emissions).toBeGreaterThan(0);
    });

    it('telemetryDistanceMeters persisted in DB', async () => {
        const ride = await makeActiveRide();
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.68, lng: 77.20 });
        const dbRide = await mongoose.model('Ride').findById(ride._id);
        expect(dbRide.telemetryDistanceMeters).toBeGreaterThan(0);
    });

    it('emissionSource persisted as TELEMETRY in DB', async () => {
        const ride = await makeActiveRide();
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        const dbRide = await mongoose.model('Ride').findById(ride._id);
        expect(dbRide.emissionSource).toBe('TELEMETRY');
    });

    it('three pings accumulate correct total distance in DB', async () => {
        const ride = await makeActiveRide();
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.65, lng: 77.20 });
        const res3 = await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.70, lng: 77.20 });
        const dbRide = await mongoose.model('Ride').findById(ride._id);
        expect(dbRide.telemetryDistanceMeters).toBe(res3.body.telemetryDistanceMeters);
        expect(dbRide.telemetryPoints.length).toBe(3);
    });

    it('GET /telemetry reflects DB-stored co2 and emissionSource', async () => {
        const ride = await makeActiveRide('BIG_CAR');
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.72, lng: 77.20 });
        const res = await request(app).get(`/api/rides/${ride._id}/telemetry`);
        expect(res.status).toBe(200);
        expect(res.body.emissionSource).toBe('TELEMETRY');
        expect(res.body.co2EmittedG).toBeGreaterThan(0);
        expect(res.body.emissionRateGPerKm).toBe(170); // BIG_CAR rate
    });

    it('request-complete uses telemetry distance when available', async () => {
        const ride = await makeActiveRide('CAR');
        await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.60, lng: 77.20 });
        const pingRes = await request(app).post(`/api/rides/${ride._id}/telemetry`).send({ lat: 28.70, lng: 77.20 });
        const telemetryDist = pingRes.body.telemetryDistanceMeters;

        const completeRes = await request(app)
            .post(`/api/rides/${ride._id}/request-complete`)
            .send({ actualLat: 28.70, actualLng: 77.20, actualAddress: `${TEST_TAG} Drop` });
        expect(completeRes.status).toBe(200);
        // actualDistanceMeters in response should equal the accumulated telemetry distance
        expect(completeRes.body.actualDistanceMeters).toBe(telemetryDist);
    });
});
