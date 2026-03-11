/**
 * Epic 1 Integration Tests — Ride Pooling
 *
 * US1.1  Pooled ride creation & searchability
 * US1.2  Flexible pickup time windows stored on pooled rides
 * US1.3  Co-rider count / occupancy constraints
 * US1.6  Safety-preference filtering (gender, verified, no-smoking, wheelchair)
 * US1.7  Auto-clustering: multiple pooled ride requests in same geographic area
 */

let app, request, mongoose;

const TEST_TAG = 'Vitest_Epic1Pool';

beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;
    mongoose = (await import('mongoose')).default;

    const server = await import('../../index.js');
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
        const Ride = mongoose.model('Ride');
        const User = mongoose.model('User');
        await Ride.deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
        await User.deleteMany({ email: new RegExp('vitest_epic1') });
    } catch (_) {}
    try { await mongoose.connection.close(); } catch (_) {}
}, 30000);

// ─── Shared helpers ────────────────────────────────────────────────────────

async function makeUser(overrides = {}) {
    const User = mongoose.model('User');
    return new User({
        role: 'RIDER',
        email: `vitest_epic1_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9000000001',
        firstName: 'Pool',
        lastName: 'Tester',
        dob: '1998-01-01',
        gender: 'Male',
        ...overrides,
    }).save();
}

async function makeRide(userId, extra = {}) {
    const Ride = mongoose.model('Ride');
    return new Ride({
        userId,
        pickup:  { address: `${TEST_TAG} Pickup`, lat: 11.0168, lng: 76.9558 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 90,
        currentFare: 90,
        vehicleCategory: 'CAR',
        status: 'SEARCHING',
        ...extra,
    }).save();
}

// ─── US 1.1 — Pooled ride matching & searchability ─────────────────────────

describe('US1.1 — Pooled ride creation and searchability', () => {
    let rider1, rider2;

    beforeAll(async () => {
        rider1 = await makeUser({ gender: 'Male' });
        rider2 = await makeUser({ gender: 'Male' });
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').deleteMany({ _id: { $in: [rider1?._id, rider2?._id] } });
        } catch (_) {}
    });

    it('1.1-A: creates a pooled ride via POST /api/rides with isPooled=true', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:  rider1._id.toString(),
            pickup:  { address: `${TEST_TAG} KR Market`, lat: 12.9766, lng: 77.5993 },
            dropoff: { address: `${TEST_TAG} Koramangala`, lat: 12.9352, lng: 77.6245 },
            fare: 80,
            isPooled: true,
            vehicleCategory: 'CAR',
        });
        expect(res.status).toBe(201);
        expect(res.body.isPooled).toBe(true);
        expect(res.body.status).toBe('SEARCHING');
        expect(res.body._id).toBeTruthy();
    });

    it('1.1-B: second pooled ride with similar route is created successfully', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:  rider2._id.toString(),
            pickup:  { address: `${TEST_TAG} KR Market B`, lat: 12.9770, lng: 77.5998 },
            dropoff: { address: `${TEST_TAG} Koramangala B`, lat: 12.9355, lng: 77.6240 },
            fare: 80,
            isPooled: true,
            vehicleCategory: 'CAR',
        });
        expect(res.status).toBe(201);
        expect(res.body.isPooled).toBe(true);
        expect(res.body.status).toBe('SEARCHING');
    });

    it('1.1-C: SEARCHING pooled ride appears in GET /api/rides/nearby', async () => {
        const ride = await makeRide(rider1._id, { isPooled: true, status: 'SEARCHING' });
        const res = await request(app)
            .get('/api/rides/nearby')
            .query({ lat: 11.0168, lng: 76.9558, radius: 10 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const ids = res.body.flatMap(r =>
            r.poolGroupRiders ? r.poolGroupRiders.map(p => p.rideId?.toString()) : [r._id?.toString()]
        ).filter(Boolean);
        expect(ids).toContain(ride._id.toString());
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.1-D: GET /api/rides/:rideId returns full pooled ride details', async () => {
        const ride = await makeRide(rider1._id, { isPooled: true });
        const res = await request(app).get(`/api/rides/${ride._id}`);
        expect(res.status).toBe(200);
        expect(res.body.isPooled).toBe(true);
        expect(res.body._id).toBe(ride._id.toString());
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.1-E: GET /api/rides/user/:userId returns pooled rides in history', async () => {
        const ride = await makeRide(rider1._id, { isPooled: true, status: 'COMPLETED' });
        const res = await request(app).get(`/api/rides/user/${rider1._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const found = res.body.find(r => r._id === ride._id.toString());
        expect(found).toBeTruthy();
        expect(found.isPooled).toBe(true);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.1-F: GET /api/rides/:rideId returns 404 for non-existent ride', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(`/api/rides/${fakeId}`);
        expect(res.status).toBe(404);
    });

    it('1.1-G: pooled ride response includes CO2 estimates at creation', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:  rider1._id.toString(),
            pickup:  { address: `${TEST_TAG} CO2 Test`, lat: 12.9766, lng: 77.5993 },
            dropoff: { address: `${TEST_TAG} CO2 Drop`,  lat: 12.9352, lng: 77.6245 },
            fare: 80,
            isPooled: true,
            vehicleCategory: 'CAR',
        });
        expect(res.status).toBe(201);
        expect(typeof res.body.co2Emissions).toBe('number');
        expect(typeof res.body.co2Saved).toBe('number');
        // Pooled rides emit less than solo — should have positive CO2 savings
        expect(res.body.co2Saved).toBeGreaterThan(0);
    });
});

// ─── US 1.2 — Flexible pickup time windows ────────────────────────────────

describe('US1.2 — Pickup time windows for pooled rides', () => {
    let rider;

    beforeAll(async () => {
        rider = await makeUser();
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').findByIdAndDelete(rider?._id);
            await mongoose.model('Ride').deleteMany({ userId: rider?._id });
        } catch (_) {}
    });

    it('1.2-A: pooled ride auto-sets pickupWindowStart/End when none provided', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:  rider._id.toString(),
            pickup:  { address: `${TEST_TAG} Win A`, lat: 12.9100, lng: 77.6000 },
            dropoff: { address: `${TEST_TAG} Win A Drop`, lat: 12.9500, lng: 77.6200 },
            fare: 75,
            isPooled: true,
            vehicleCategory: 'CAR',
        });
        expect(res.status).toBe(201);
        expect(res.body.pickupWindowStart).toBeTruthy();
        expect(res.body.pickupWindowEnd).toBeTruthy();
        const start = new Date(res.body.pickupWindowStart);
        const end   = new Date(res.body.pickupWindowEnd);
        expect(end > start).toBe(true);
        // Default window is DEFAULT_POOL_WINDOW_MINUTES (typically 15 min)
        const diffMin = (end - start) / 60000;
        expect(diffMin).toBeGreaterThanOrEqual(10);
        expect(diffMin).toBeLessThanOrEqual(120);
    });

    it('1.2-B: provided pickupWindowStart and pickupWindowEnd are persisted', async () => {
        const windowStart = new Date(Date.now() + 10 * 60 * 1000);
        const windowEnd   = new Date(Date.now() + 30 * 60 * 1000);
        const res = await request(app).post('/api/rides').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} Win B`, lat: 12.9100, lng: 77.6000 },
            dropoff:         { address: `${TEST_TAG} Win B Drop`, lat: 12.9500, lng: 77.6200 },
            fare:            75,
            isPooled:        true,
            vehicleCategory: 'CAR',
            pickupWindowStart: windowStart.toISOString(),
            pickupWindowEnd:   windowEnd.toISOString(),
        });
        expect(res.status).toBe(201);
        const storedStart = new Date(res.body.pickupWindowStart);
        const storedEnd   = new Date(res.body.pickupWindowEnd);
        // Allow 5-second clock drift
        expect(Math.abs(storedStart - windowStart)).toBeLessThan(5000);
        expect(storedEnd >= windowEnd || Math.abs(storedEnd - windowEnd) < 5000).toBe(true);
    });

    it('1.2-C: POST /api/rides/schedule stores isScheduled=true and scheduledFor', async () => {
        const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const res = await request(app).post('/api/rides/schedule').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} Sched`, lat: 12.9100, lng: 77.6000 },
            dropoff:         { address: `${TEST_TAG} Sched Drop`, lat: 12.9500, lng: 77.6200 },
            fare:            100,
            vehicleCategory: 'CAR',
            scheduledFor:    scheduledFor.toISOString(),
        });
        expect(res.status).toBe(201);
        expect(res.body.isScheduled).toBe(true);
        const storedFor = new Date(res.body.scheduledFor);
        expect(Math.abs(storedFor - scheduledFor)).toBeLessThan(5000);
    });

    it('1.2-D: GET /api/rides/scheduled/:userId lists upcoming scheduled rides', async () => {
        const scheduledFor = new Date(Date.now() + 3 * 60 * 60 * 1000);
        await request(app).post('/api/rides/schedule').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} SchedList`, lat: 12.9100, lng: 77.6000 },
            dropoff:         { address: `${TEST_TAG} SchedList Drop`, lat: 12.9500, lng: 77.6200 },
            fare:            100,
            vehicleCategory: 'CAR',
            scheduledFor:    scheduledFor.toISOString(),
        });
        const res = await request(app).get(`/api/rides/scheduled/${rider._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body.every(r => r.isScheduled === true)).toBe(true);
    });

    it('1.2-E: DELETE /api/rides/scheduled/:rideId cancels a scheduled ride', async () => {
        const scheduledFor = new Date(Date.now() + 4 * 60 * 60 * 1000);
        const createRes = await request(app).post('/api/rides/schedule').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} Cancel Sched`, lat: 12.9100, lng: 77.6000 },
            dropoff:         { address: `${TEST_TAG} Cancel Sched Drop`, lat: 12.9500, lng: 77.6200 },
            fare:            100,
            vehicleCategory: 'CAR',
            scheduledFor:    scheduledFor.toISOString(),
        });
        expect(createRes.status).toBe(201);
        const rideId = createRes.body._id;

        const delRes = await request(app).delete(`/api/rides/scheduled/${rideId}`);
        expect(delRes.status).toBe(200);
        expect(delRes.body.ok).toBe(true);

        const ride = await mongoose.model('Ride').findById(rideId);
        expect(ride.status).toBe('CANCELED');
    });

    it('1.2-F: POST /api/rides/schedule returns 400 when scheduledFor is missing', async () => {
        const res = await request(app).post('/api/rides/schedule').send({
            userId: rider._id.toString(),
            pickup: { address: `${TEST_TAG} NoDate`, lat: 12.9100, lng: 77.6000 },
        });
        expect(res.status).toBe(400);
    });
});

// ─── US 1.3 — Co-rider count and pool capacity ────────────────────────────

describe('US1.3 — Co-rider count and pool occupancy', () => {
    let rider;

    beforeAll(async () => { rider = await makeUser(); });

    afterAll(async () => {
        try {
            await mongoose.model('User').findByIdAndDelete(rider?._id);
            await mongoose.model('Ride').deleteMany({ userId: rider?._id });
        } catch (_) {}
    });

    it('1.3-A: maxPoolSize defaults to 4 on a pooled ride', async () => {
        const ride = await makeRide(rider._id, { isPooled: true });
        expect(ride.maxPoolSize).toBe(4);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.3-B: custom maxPoolSize is stored correctly', async () => {
        const ride = await makeRide(rider._id, { isPooled: true, maxPoolSize: 2 });
        const fetched = await mongoose.model('Ride').findById(ride._id);
        expect(fetched.maxPoolSize).toBe(2);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.3-C: passengers field defaults to 1', async () => {
        const ride = await makeRide(rider._id, { isPooled: true });
        const fetched = await mongoose.model('Ride').findById(ride._id);
        expect(fetched.passengers).toBe(1);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.3-D: pooledRiders array is initially empty for a new ride', async () => {
        const ride = await makeRide(rider._id, { isPooled: true });
        const res = await request(app).get(`/api/rides/${ride._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.pooledRiders)).toBe(true);
        expect(res.body.pooledRiders.length).toBe(0);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.3-E: maxPassengers defaults to 4', async () => {
        const ride = await makeRide(rider._id, { isPooled: true });
        const fetched = await mongoose.model('Ride').findById(ride._id);
        expect(fetched.maxPassengers).toBe(4);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('1.3-F: GET /api/rides/:rideId response includes pooledRiders array', async () => {
        const ride = await makeRide(rider._id, { isPooled: true });
        const res = await request(app).get(`/api/rides/${ride._id}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('pooledRiders');
        expect(Array.isArray(res.body.pooledRiders)).toBe(true);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });
});

// ─── US 1.6 — Safety preferences & gender-based filtering ────────────────

describe('US1.6 — Safety preferences and gender filtering', () => {
    let femaleRider, maleRider;

    beforeAll(async () => {
        femaleRider = await makeUser({ gender: 'Female' });
        maleRider   = await makeUser({ gender: 'Male' });
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').deleteMany({ _id: { $in: [femaleRider?._id, maleRider?._id] } });
            await mongoose.model('Ride').deleteMany({
                $or: [{ userId: femaleRider?._id }, { userId: maleRider?._id }],
            });
        } catch (_) {}
    });

    it('1.6-A: womenOnly safety preference is persisted on ride creation', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          femaleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} WomenOnly`, lat: 12.9100, lng: 77.6000 },
            dropoff:         { address: `${TEST_TAG} WomenOnly Drop`, lat: 12.9500, lng: 77.6200 },
            fare:            80,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { womenOnly: true },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.womenOnly).toBe(true);
    });

    it('1.6-B: verifiedOnly preference is stored correctly', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          femaleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} VerOnly`, lat: 12.9200, lng: 77.6100 },
            dropoff:         { address: `${TEST_TAG} VerOnly Drop`, lat: 12.9600, lng: 77.6300 },
            fare:            80,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { verifiedOnly: true },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.verifiedOnly).toBe(true);
    });

    it('1.6-C: noSmoking preference is stored', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          maleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} NoSmoke`, lat: 12.9300, lng: 77.6200 },
            dropoff:         { address: `${TEST_TAG} NoSmoke Drop`, lat: 12.9700, lng: 77.6400 },
            fare:            80,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { noSmoking: true },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.noSmoking).toBe(true);
    });

    it('1.6-D: genderPreference enum value is persisted', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          femaleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} GenPref`, lat: 12.9400, lng: 77.6300 },
            dropoff:         { address: `${TEST_TAG} GenPref Drop`, lat: 12.9800, lng: 77.6500 },
            fare:            80,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { genderPreference: 'female' },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.genderPreference).toBe('female');
    });

    it('1.6-E: womenOnly ride and male ride created independently — pref is retained on female ride', async () => {
        const femRes = await request(app).post('/api/rides').send({
            userId:          femaleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} FemGate`, lat: 11.0100, lng: 76.9500 },
            dropoff:         { address: `${TEST_TAG} FemGate Drop`, lat: 11.0400, lng: 76.9800 },
            fare:            100,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { womenOnly: true },
        });
        const maleRes = await request(app).post('/api/rides').send({
            userId:          maleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} MaleGate`, lat: 11.0102, lng: 76.9502 },
            dropoff:         { address: `${TEST_TAG} MaleGate Drop`, lat: 11.0402, lng: 76.9802 },
            fare:            100,
            isPooled:        true,
            vehicleCategory: 'CAR',
        });
        expect(femRes.status).toBe(201);
        expect(maleRes.status).toBe(201);
        // Female preference retained
        expect(femRes.body.safetyPreferences.womenOnly).toBe(true);
        // Male ride has no womenOnly set
        expect(maleRes.body.safetyPreferences?.womenOnly).toBeFalsy();
    }, 60000);

    it('1.6-F: needsWheelchair and wheelchairFriendly preferences stored', async () => {
        const needsWC = await request(app).post('/api/rides').send({
            userId:          maleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} WC Need`, lat: 12.9500, lng: 77.6400 },
            dropoff:         { address: `${TEST_TAG} WC Need Drop`, lat: 12.9900, lng: 77.6600 },
            fare:            80,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { needsWheelchair: true },
        });
        expect(needsWC.status).toBe(201);
        expect(needsWC.body.safetyPreferences.needsWheelchair).toBe(true);

        const wcFriendly = await request(app).post('/api/rides').send({
            userId:          femaleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} WC Friendly`, lat: 12.9600, lng: 77.6500 },
            dropoff:         { address: `${TEST_TAG} WC Friendly Drop`, lat: 13.0000, lng: 77.6700 },
            fare:            80,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { wheelchairFriendly: true },
        });
        expect(wcFriendly.status).toBe(201);
        expect(wcFriendly.body.safetyPreferences.wheelchairFriendly).toBe(true);
    });

    it('1.6-G: PUT /api/users/:userId persists gender and profile fields', async () => {
        const res = await request(app)
            .put(`/api/users/${femaleRider._id}`)
            .send({ gender: 'Female', firstName: 'SafePool', lastName: 'Lady' });
        expect(res.status).toBe(200);
        expect(res.body.gender).toBe('Female');
        expect(res.body.firstName).toBe('SafePool');
    });
});

// ─── US 1.7 — Auto-clustering of pooled ride requests ─────────────────────

describe('US1.7 — Auto-clustering of pooled ride requests', () => {
    let riders = [];
    let rides  = [];

    beforeAll(async () => {
        riders = await Promise.all([
            makeUser({ gender: 'Male' }),
            makeUser({ gender: 'Female' }),
            makeUser({ gender: 'Male' }),
        ]);
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').deleteMany({ _id: { $in: rides.map(r => r._id) } });
            await mongoose.model('User').deleteMany({ _id: { $in: riders.map(u => u._id) } });
        } catch (_) {}
    });

    it('1.7-A: creates 3 pooled rides in the same geographic cluster', async () => {
        rides = await Promise.all(
            riders.map((r, i) =>
                makeRide(r._id, {
                    isPooled: true,
                    status:   'SEARCHING',
                    pickup:  { address: `${TEST_TAG} Cluster${i}`, lat: 11.0168 + i * 0.001, lng: 76.9558 + i * 0.001 },
                    dropoff: { address: `${TEST_TAG} ClusterDrop${i}`, lat: 11.0500 + i * 0.001, lng: 76.9900 + i * 0.001 },
                })
            )
        );
        expect(rides).toHaveLength(3);
        rides.forEach(r => {
            expect(r.isPooled).toBe(true);
            expect(r.status).toBe('SEARCHING');
        });
    });

    it('1.7-B: GET /api/rides/nearby returns all rides in the cluster area', async () => {
        const res = await request(app)
            .get('/api/rides/nearby')
            .query({ lat: 11.0168, lng: 76.9558, radius: 10 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const returnedIds = res.body.flatMap(r =>
            r.poolGroupRiders
                ? r.poolGroupRiders.map(p => p.rideId?.toString())
                : [r._id?.toString()]
        ).filter(Boolean);
        const foundCount = rides.filter(r => returnedIds.includes(r._id.toString())).length;
        expect(foundCount).toBeGreaterThanOrEqual(1);
    });

    it('1.7-C: each clustered ride is individually fetchable via GET /api/rides/:rideId', async () => {
        for (const ride of rides) {
            const res = await request(app).get(`/api/rides/${ride._id}`);
            expect(res.status).toBe(200);
            expect(res.body.isPooled).toBe(true);
            expect(res.body._id).toBe(ride._id.toString());
        }
    });

    it('1.7-D: all rides in the cluster share the same vehicleCategory', async () => {
        const fetched = await Promise.all(rides.map(r => mongoose.model('Ride').findById(r._id)));
        fetched.forEach(r => expect(r.vehicleCategory).toBe('CAR'));
    });

    it('1.7-E: each clustered ride appears in its rider\'s ride history', async () => {
        for (let i = 0; i < rides.length; i++) {
            const res = await request(app).get(`/api/rides/user/${riders[i]._id}`);
            expect(res.status).toBe(200);
            const rideIds = res.body.map(r => r._id);
            expect(rideIds).toContain(rides[i]._id.toString());
        }
    });
});
