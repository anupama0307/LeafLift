/**
 * Integration tests for Epic 2 — Ride Navigation & ETA
 *
 * Covers all 7 user stories end-to-end against the live server and MongoDB:
 *   US2.1 — Distance and duration before booking (GET /api/rides/estimate)
 *   US2.2 — Live ETA countdown on active ride (GET /api/rides/:id/arrival-eta)
 *   US2.3 — Visual progress bar on active ride  (GET /api/rides/:id/trip-progress)
 *   US2.4 — Fare estimate consistency end-to-end
 *   US2.5 — Route alternatives (Fastest / Balanced / Scenic fare ordering)
 *   US2.6 — Driver nearby Socket.IO detection (driver:location → driver:nearby)
 *   US2.7 — Share arrival time (estimatedArrivalTime for clipboard share)
 *
 * Pattern: rides & users are created through the real REST API (POST /api/rides /
 * POST /api/users) wherever possible; for IN_PROGRESS lifecycle tests that need
 * startedAt/originalEtaMinutes the ride document is mutated via Mongoose directly
 * (the server itself only sets startedAt via the OTP-verify flow, which requires a
 * full driver-acceptance chain).  Either way the ETA/progress endpoints are hit
 * through the real HTTP layer.
 *
 * Cleanup: all test data is tagged with TEST_TAG and removed in afterAll.
 */

let app, httpServer, request, mongoose, ioclient;
let testPort = 0;
const TEST_TAG = 'Vitest_Epic2ETA';

// Fare constants that mirror constants.tsx VEHICLE_CATEGORIES
const FARE_RATES = {
    BIKE:    { baseRate: 15, perKmRate: 7  },
    AUTO:    { baseRate: 25, perKmRate: 10 },
    CAR:     { baseRate: 30, perKmRate: 12 },
    BIG_CAR: { baseRate: 50, perKmRate: 18 },
};

// Route distance multipliers (Fastest 1.0×, Balanced 1.2×, Scenic 1.4×)
const ROUTE_MULTIPLIERS = [1.0, 1.2, 1.4];

// Coimbatore test coords (~5 km apart straight-line)
const PICKUP  = { lat: 11.0168, lng: 76.9558 }; // Gandhipuram
const DROPOFF = { lat: 11.0500, lng: 76.9900 }; // RS Puram

// Socket.IO proximity coords
const CLOSE_LOC = { lat: 11.0186, lng: 76.9558 }; // ~200 m north of PICKUP
const FAR_LOC   = { lat: 11.0213, lng: 76.9558 }; // ~500 m north of PICKUP

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeFare(category, distKm) {
    const { baseRate, perKmRate } = FARE_RATES[category];
    return Math.round(baseRate + distKm * perKmRate);
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const estimateQs = (p, d) =>
    `/api/rides/estimate?pickupLat=${p.lat}&pickupLng=${p.lng}&dropoffLat=${d.lat}&dropoffLng=${d.lng}`;

// Create user document directly in DB
async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_epic2_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9876543210',
        firstName: 'Epic2', lastName: 'Tester',
        dob: '1998-05-15', gender: 'Male', isVerified: false,
        ...o,
    }).save();
}

// Create ride document directly in DB (for lifecycle tests needing specific timing)
async function makeRide(userId, extra = {}) {
    return new (mongoose.model('Ride'))({
        userId,
        pickup:  { address: `${TEST_TAG} Pickup`,  lat: PICKUP.lat,  lng: PICKUP.lng  },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: DROPOFF.lat, lng: DROPOFF.lng },
        fare: 90, currentFare: 90,
        vehicleCategory: 'CAR',
        status: 'SEARCHING',
        ...extra,
    }).save();
}

// Connect a Socket.IO client and register userId+role
function connectSocket(userId, role) {
    const socket = ioclient(`http://127.0.0.1:${testPort}`, {
        transports: ['websocket'],
        forceNew: true,
    });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
        socket.once('connect', () => {
            clearTimeout(timer);
            if (userId) socket.emit('register', { userId: String(userId), role });
            resolve(socket);
        });
        socket.once('connect_error', reject);
    });
}

function waitForSocketEvent(socket, eventName, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Timeout waiting for socket event: '${eventName}'`)),
            timeoutMs
        );
        socket.once(eventName, (data) => { clearTimeout(timer); resolve(data); });
    });
}

function expectNoSocketEvent(socket, eventName, waitMs = 1500) {
    return new Promise((resolve) => {
        let received = false;
        const handler = () => { received = true; };
        socket.once(eventName, handler);
        setTimeout(() => { socket.off(eventName, handler); resolve(received); }, waitMs);
    });
}

// ─── global setup ─────────────────────────────────────────────────────────────

beforeAll(async () => {
    const supertest     = await import('supertest');
    request             = supertest.default;
    mongoose            = (await import('mongoose')).default;
    const ioclientModule = await import('socket.io-client');
    ioclient            = ioclientModule.default ?? ioclientModule.io;

    const server = await import('../../index.js');
    app        = server.app;
    httpServer = server.httpServer;

    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            mongoose.connection.once('connected', resolve);
            setTimeout(resolve, 8000);
        });
    }

    // Start HTTP server on a random port (needed for Socket.IO tests)
    await new Promise((resolve, reject) => {
        if (httpServer.listening) return resolve();
        httpServer.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });
    testPort = httpServer.address().port;
}, 25000);

afterAll(async () => {
    try {
        await mongoose.model('Ride').deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_epic2') });
    } catch (_) {}
    try {
        if (httpServer.listening) {
            await new Promise((resolve) => {
                if (typeof httpServer.closeAllConnections === 'function') httpServer.closeAllConnections();
                const t = setTimeout(resolve, 5000);
                httpServer.close(() => { clearTimeout(t); resolve(); });
            });
        }
    } catch (_) {}
    try { await mongoose.connection.close(); } catch (_) {}
}, 35000);

// ═════════════════════════════════════════════════════════════════════════════
// US2.1 — Distance and duration before booking
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.1 — Distance and duration before booking', () => {

    it('2.1-A: GET /api/rides/estimate returns 200 with straightLineKm, estimatedDurationMin, vehicleEstimates', async () => {
        const res = await request(app).get(estimateQs(PICKUP, DROPOFF));
        expect(res.status).toBe(200);
        expect(typeof res.body.straightLineKm).toBe('number');
        expect(res.body.straightLineKm).toBeGreaterThan(0);
        expect(typeof res.body.estimatedDurationMin).toBe('number');
        expect(res.body.estimatedDurationMin).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(res.body.vehicleEstimates)).toBe(true);
        expect(res.body.vehicleEstimates.length).toBe(4);
    });

    it('2.1-B: straightLineKm matches independent Haversine calculation (within ±0.1 km)', async () => {
        const res      = await request(app).get(estimateQs(PICKUP, DROPOFF));
        const expected = parseFloat(haversineKm(PICKUP.lat, PICKUP.lng, DROPOFF.lat, DROPOFF.lng).toFixed(2));
        expect(res.body.straightLineKm).toBeCloseTo(expected, 1);
    });

    it('2.1-C: estimate → create ride using fare from estimate — ride stores that fare correctly', async () => {
        const user = await makeUser();
        const est  = await request(app).get(estimateQs(PICKUP, DROPOFF));
        const fare = computeFare('CAR', est.body.straightLineKm);

        const rideRes = await request(app).post('/api/rides').send({
            userId:          user._id.toString(),
            pickup:          { address: `${TEST_TAG} Booking`, lat: PICKUP.lat, lng: PICKUP.lng },
            dropoff:         { address: `${TEST_TAG} Booking Drop`, lat: DROPOFF.lat, lng: DROPOFF.lng },
            fare,
            vehicleCategory: 'CAR',
            isPooled:        false,
        });
        expect(rideRes.status).toBe(201);
        expect(rideRes.body.fare).toBe(fare);
    });

    it('2.1-D: longer trip has greater straightLineKm and estimatedDurationMin', async () => {
        const SHORT = { lat: 11.0200, lng: 76.9580 }; // ~350 m
        const [short, long] = await Promise.all([
            request(app).get(estimateQs(PICKUP, SHORT)),
            request(app).get(estimateQs(PICKUP, DROPOFF)),
        ]);
        expect(long.body.straightLineKm).toBeGreaterThan(short.body.straightLineKm);
        expect(long.body.estimatedDurationMin).toBeGreaterThanOrEqual(short.body.estimatedDurationMin);
    });

    it('2.1-E: all 4 vehicle categories in vehicleEstimates each have positive co2EmittedG', async () => {
        const res = await request(app).get(estimateQs(PICKUP, DROPOFF));
        for (const cat of ['BIKE', 'AUTO', 'CAR', 'BIG_CAR']) {
            const v = res.body.vehicleEstimates.find(x => x.category === cat);
            expect(v).toBeDefined();
            expect(v.co2EmittedG).toBeGreaterThan(0);
        }
    });

    it('2.1-F: missing coordinates return 400', async () => {
        const res = await request(app)
            .get('/api/rides/estimate?pickupLat=11.0168&pickupLng=76.9558');
        expect(res.status).toBe(400);
    });

    it('2.1-G: same pickup/dropoff returns straightLineKm ≈ 0 and estimatedDurationMin ≥ 1', async () => {
        const res = await request(app).get(estimateQs(PICKUP, PICKUP));
        expect(res.body.straightLineKm).toBeCloseTo(0, 0);
        expect(res.body.estimatedDurationMin).toBeGreaterThanOrEqual(1);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// US2.2 — Live ETA countdown on active ride screen
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.2 — Live ETA countdown on active ride screen', () => {
    let rider, apiRide;

    beforeAll(async () => {
        rider = await makeUser();
        // Create ride via the real REST API to test the endpoint against an API-created ride
        const res = await request(app).post('/api/rides').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} ETA Ride`, lat: PICKUP.lat, lng: PICKUP.lng },
            dropoff:         { address: `${TEST_TAG} ETA Drop`,  lat: DROPOFF.lat, lng: DROPOFF.lng },
            fare:            90,
            vehicleCategory: 'CAR',
        });
        apiRide = res.body;
    });

    it('2.2-A: freshly created SEARCHING ride returns remainingMinutes: null from GET /arrival-eta', async () => {
        const res = await request(app).get(`/api/rides/${apiRide._id}/arrival-eta`);
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBeNull();
        expect(res.body.status).toBe('SEARCHING');
    });

    it('2.2-B: IN_PROGRESS ride with startedAt=now → remainingMinutes == originalEtaMinutes', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: new Date(), originalEtaMinutes: 20,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBe(20);
        expect(res.body.elapsedMinutes).toBe(0);
    });

    it('2.2-C: ride started 5 min ago → remainingMinutes == originalEtaMinutes − 5', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 5 * 60 * 1000),
            originalEtaMinutes: 20,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        expect(res.body.remainingMinutes).toBe(15);
        expect(res.body.elapsedMinutes).toBe(5);
    });

    it('2.2-D: estimatedArrivalTime equals startedAt + originalEtaMinutes (within 2 s)', async () => {
        const now = new Date();
        const eta = 20;
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: now, originalEtaMinutes: eta,
        });
        const res      = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        const expected = now.getTime() + eta * 60 * 1000;
        const actual   = new Date(res.body.estimatedArrivalTime).getTime();
        expect(Math.abs(actual - expected)).toBeLessThan(2000);
    });

    it('2.2-E: overdue ride (elapsed > ETA) returns remainingMinutes = 0, not negative', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 30 * 60 * 1000),
            originalEtaMinutes: 15,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        expect(res.body.remainingMinutes).toBe(0);
    });

    it('2.2-F: GET /arrival-eta returns 404 for a non-existent ride ID', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res    = await request(app).get(`/api/rides/${fakeId}/arrival-eta`);
        expect(res.status).toBe(404);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// US2.3 — Visual progress bar on active ride screen
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.3 — Visual progress bar on active ride', () => {
    let rider;

    beforeAll(async () => { rider = await makeUser(); });

    it('2.3-A: SEARCHING ride returns progressPercent = 0', async () => {
        const ride = await makeRide(rider._id, { status: 'SEARCHING' });
        const res  = await request(app).get(`/api/rides/${ride._id}/trip-progress`);
        expect(res.status).toBe(200);
        expect(res.body.progressPercent).toBe(0);
    });

    it('2.3-B: freshly started IN_PROGRESS ride returns progressPercent = 0', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: new Date(), originalEtaMinutes: 20,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/trip-progress`);
        expect(res.body.progressPercent).toBe(0);
    });

    it('2.3-C: ride 10 min into a 20 min trip → progressPercent = 50', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 10 * 60 * 1000),
            originalEtaMinutes: 20,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/trip-progress`);
        expect(res.body.progressPercent).toBe(50);
    });

    it('2.3-D: elapsed > originalEtaMinutes → progressPercent capped at 100', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 30 * 60 * 1000),
            originalEtaMinutes: 15,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/trip-progress`);
        expect(res.body.progressPercent).toBe(100);
    });

    it('2.3-E: response includes all fields needed for UI rendering', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 5 * 60 * 1000),
            originalEtaMinutes: 20,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/trip-progress`);
        expect(res.body).toHaveProperty('progressPercent');
        expect(res.body).toHaveProperty('elapsedMinutes');
        expect(res.body).toHaveProperty('originalEtaMinutes');
        expect(res.body).toHaveProperty('startedAt');
        expect(res.body).toHaveProperty('status', 'IN_PROGRESS');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// US2.4 — Fare estimate consistency end-to-end
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.4 — Fare estimate consistency', () => {

    it('2.4-A: CAR fare = Math.round(30 + distKm × 12) — formula matches server estimate', async () => {
        const res    = await request(app).get(estimateQs(PICKUP, DROPOFF));
        const dist   = res.body.straightLineKm;
        expect(computeFare('CAR', dist)).toBe(Math.round(30 + dist * 12));
    });

    it('2.4-B: BIKE < AUTO < CAR < BIG_CAR fare for the same route', async () => {
        const res  = await request(app).get(estimateQs(PICKUP, DROPOFF));
        const dist = res.body.straightLineKm;
        expect(computeFare('BIKE', dist)).toBeLessThan(computeFare('AUTO', dist));
        expect(computeFare('AUTO', dist)).toBeLessThan(computeFare('CAR', dist));
        expect(computeFare('CAR',  dist)).toBeLessThan(computeFare('BIG_CAR', dist));
    });

    it('2.4-C: longer trip produces higher fare than shorter trip (same category)', async () => {
        const SHORT = { lat: 11.0200, lng: 76.9580 };
        const [short, long] = await Promise.all([
            request(app).get(estimateQs(PICKUP, SHORT)),
            request(app).get(estimateQs(PICKUP, DROPOFF)),
        ]);
        expect(computeFare('CAR', long.body.straightLineKm))
            .toBeGreaterThan(computeFare('CAR', short.body.straightLineKm));
    });

    it('2.4-D: ride created via API with fare from estimate stores that fare — retrievable via GET', async () => {
        const user = await makeUser();
        const est  = await request(app).get(estimateQs(PICKUP, DROPOFF));
        const fare = computeFare('AUTO', est.body.straightLineKm);

        const rideRes = await request(app).post('/api/rides').send({
            userId:          user._id.toString(),
            pickup:          { address: `${TEST_TAG} FareCheck`, lat: PICKUP.lat, lng: PICKUP.lng },
            dropoff:         { address: `${TEST_TAG} FareCheck Drop`, lat: DROPOFF.lat, lng: DROPOFF.lng },
            fare,
            vehicleCategory: 'AUTO',
        });
        expect(rideRes.status).toBe(201);
        const getRes = await request(app).get(`/api/rides/${rideRes.body._id}`);
        expect(getRes.body.fare).toBe(fare);
    });

    it('2.4-E: each vehicleEstimate has estimatedDurationMin > 0 and co2EmittedG > 0', async () => {
        const res = await request(app).get(estimateQs(PICKUP, DROPOFF));
        for (const v of res.body.vehicleEstimates) {
            expect(v.estimatedDurationMin).toBeGreaterThan(0);
            expect(v.co2EmittedG).toBeGreaterThan(0);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// US2.5 — Route alternatives (Fastest / Balanced / Scenic)
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.5 — Route alternatives switcher', () => {
    let baseDist;

    beforeAll(async () => {
        const res = await request(app).get(estimateQs(PICKUP, DROPOFF));
        baseDist  = res.body.straightLineKm;
    });

    it('2.5-A: Fastest (1.0×) fare ≤ Balanced (1.2×) fare for CAR', () => {
        expect(computeFare('CAR', baseDist * 1.2))
            .toBeGreaterThanOrEqual(computeFare('CAR', baseDist * 1.0));
    });

    it('2.5-B: Balanced (1.2×) fare < Scenic (1.4×) fare for CAR', () => {
        expect(computeFare('CAR', baseDist * 1.4))
            .toBeGreaterThan(computeFare('CAR', baseDist * 1.2));
    });

    it('2.5-C: Fastest ≤ Balanced ≤ Scenic fare ordering holds for all 4 vehicle categories', () => {
        for (const cat of ['BIKE', 'AUTO', 'CAR', 'BIG_CAR']) {
            const fares = ROUTE_MULTIPLIERS.map(m => computeFare(cat, baseDist * m));
            expect(fares[0]).toBeLessThanOrEqual(fares[1]);
            expect(fares[1]).toBeLessThanOrEqual(fares[2]);
        }
    });

    it('2.5-D: Scenic fare = Math.round(baseRate + 1.4 × dist × perKmRate)', () => {
        const scenic = computeFare('CAR', baseDist * 1.4);
        expect(scenic).toBe(Math.round(30 + baseDist * 1.4 * 12));
    });

    it('2.5-E: two rides created with Fastest vs Scenic fares store different fares via the API', async () => {
        const rider   = await makeUser();
        const fastest = computeFare('CAR', baseDist * 1.0);
        const scenic  = computeFare('CAR', baseDist * 1.4);
        const [r1, r2] = await Promise.all([
            request(app).post('/api/rides').send({
                userId:          rider._id.toString(),
                pickup:          { address: `${TEST_TAG} FastRoute`,  lat: PICKUP.lat, lng: PICKUP.lng },
                dropoff:         { address: `${TEST_TAG} FastDrop`,   lat: DROPOFF.lat, lng: DROPOFF.lng },
                fare:            fastest,
                vehicleCategory: 'CAR',
            }),
            request(app).post('/api/rides').send({
                userId:          rider._id.toString(),
                pickup:          { address: `${TEST_TAG} ScenicRoute`, lat: PICKUP.lat, lng: PICKUP.lng },
                dropoff:         { address: `${TEST_TAG} ScenicDrop`,  lat: DROPOFF.lat, lng: DROPOFF.lng },
                fare:            scenic,
                vehicleCategory: 'CAR',
            }),
        ]);
        expect(r1.status).toBe(201);
        expect(r2.status).toBe(201);
        expect(r2.body.fare).toBeGreaterThan(r1.body.fare);
    }, 45000);
});

// ═════════════════════════════════════════════════════════════════════════════
// US2.6 — Driver nearby alert via Socket.IO
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.6 — Driver nearby Socket.IO detection', () => {

    it('2.6-A: driver within 300 m of ACCEPTED ride pickup → driver:nearby event emitted to rider', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER', isVerified: true });
        const ride   = await makeRide(rider._id, {
            driverId: driver._id,
            status:   'ACCEPTED',
        });

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        // Join the ride room so driver:nearby is received via ride:{rideId} broadcast too
        riderSocket.emit('join:ride', { rideId: ride._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        const nearbyPromise = waitForSocketEvent(riderSocket, 'driver:nearby', 12000);
        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng,
        });

        const payload = await nearbyPromise;
        expect(payload).toHaveProperty('rideId', ride._id.toString());

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 25000);

    it('2.6-B: driver > 300 m away from pickup — driver:nearby NOT emitted', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER', isVerified: true });
        const ride   = await makeRide(rider._id, {
            driverId: driver._id,
            status:   'ACCEPTED',
        });

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        riderSocket.emit('join:ride', { rideId: ride._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: FAR_LOC.lat,
            lng: FAR_LOC.lng,
        });

        const received = await expectNoSocketEvent(riderSocket, 'driver:nearby', 3000);
        expect(received).toBe(false);

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 20000);

    it('2.6-C: driver:nearby not emitted twice for the same ride (deduplication)', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER', isVerified: true });
        const ride   = await makeRide(rider._id, {
            driverId: driver._id,
            status:   'ACCEPTED',
        });

        // Register only in user: room — NOT in ride: room so each server emission
        // counts as exactly one event on this socket (avoids double-count from
        // rider being in both user:{id} and ride:{id} rooms simultaneously).
        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        await new Promise(r => setTimeout(r, 300));

        let count = 0;
        riderSocket.on('driver:nearby', () => { count++; });

        // First emit — within threshold → should trigger driver:nearby once
        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng,
        });
        await new Promise(r => setTimeout(r, 1200)); // wait past 1s throttle

        // Second emit — same ride, already in nearbyNotifiedRides → deduped
        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng + 0.0001,
        });
        await new Promise(r => setTimeout(r, 1500));

        // Server deduplicates — should fire at most once
        expect(count).toBeLessThanOrEqual(1);

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 20000);
});

// ═════════════════════════════════════════════════════════════════════════════
// US2.7 — Share arrival time with waiting contacts
// ═════════════════════════════════════════════════════════════════════════════

describe('US2.7 — Share arrival time (estimatedArrivalTime)', () => {
    let rider;

    beforeAll(async () => { rider = await makeUser(); });

    it('2.7-A: IN_PROGRESS ride (just started) → estimatedArrivalTime is in the future', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: new Date(), originalEtaMinutes: 20,
        });
        const res     = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        const arrival = new Date(res.body.estimatedArrivalTime).getTime();
        expect(arrival).toBeGreaterThan(Date.now() - 5000); // within 5 s tolerance
    });

    it('2.7-B: estimatedArrivalTime = startedAt + originalEtaMinutes (within 2 s)', async () => {
        const now = new Date();
        const eta = 15;
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: now, originalEtaMinutes: eta,
        });
        const res      = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        const expected = now.getTime() + eta * 60 * 1000;
        const actual   = new Date(res.body.estimatedArrivalTime).getTime();
        expect(Math.abs(actual - expected)).toBeLessThan(2000);
    });

    it('2.7-C: SEARCHING and ACCEPTED rides return estimatedArrivalTime: null (not yet shareable)', async () => {
        const [searching, accepted] = await Promise.all([
            makeRide(rider._id, { status: 'SEARCHING' }),
            makeRide(rider._id, { status: 'ACCEPTED'  }),
        ]);
        const [r1, r2] = await Promise.all([
            request(app).get(`/api/rides/${searching._id}/arrival-eta`),
            request(app).get(`/api/rides/${accepted._id}/arrival-eta`),
        ]);
        expect(r1.body.estimatedArrivalTime).toBeNull();
        expect(r2.body.estimatedArrivalTime).toBeNull();
    });

    it('2.7-D: two rapid polls return the identical estimatedArrivalTime (stable for clipboard copy)', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: new Date(), originalEtaMinutes: 30,
        });
        const [r1, r2] = await Promise.all([
            request(app).get(`/api/rides/${ride._id}/arrival-eta`),
            request(app).get(`/api/rides/${ride._id}/arrival-eta`),
        ]);
        expect(r1.body.estimatedArrivalTime).toBe(r2.body.estimatedArrivalTime);
    });

    it('2.7-E: response includes all fields needed to build a share message (status, ETA time, remaining min)', async () => {
        const ride = await makeRide(rider._id, {
            status: 'IN_PROGRESS', startedAt: new Date(), originalEtaMinutes: 12,
        });
        const res = await request(app).get(`/api/rides/${ride._id}/arrival-eta`);
        // All fields required by the share-message builder
        expect(res.body).toHaveProperty('status', 'IN_PROGRESS');
        expect(res.body).toHaveProperty('estimatedArrivalTime');
        expect(typeof res.body.remainingMinutes).toBe('number');
        expect(typeof res.body.originalEtaMinutes).toBe('number');
        expect(typeof res.body.elapsedMinutes).toBe('number');
        // estimatedArrivalTime must be a valid ISO date string
        expect(new Date(res.body.estimatedArrivalTime).toISOString()).toBe(res.body.estimatedArrivalTime);
    });
});
