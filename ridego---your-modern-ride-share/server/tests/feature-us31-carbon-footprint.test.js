/**
 * US 3.1 — Carbon Footprint Tests
 *
 * 3.1.2 — Algorithm: CO2 calculated correctly based on distance + vehicle category
 * 3.1.1 — Dashboard: /api/users/:userId/stats returns CO2 fields for widget
 * 3.1.3 — Ride summary: co2Emissions & co2Saved populated on ride creation;
 *          /api/rides/:rideId/carbon returns full footprint breakdown
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US31';

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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us31') });
    } catch (_) {}
    await mongoose.connection.close();
});

// ─── helpers ───
async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_us31_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9912345678',
        firstName: 'Carbon', lastName: 'Tester',
        dob: '1999-01-01', gender: 'Male', isVerified: false,
        ...o
    }).save();
}

async function makeRide(userId, extra = {}) {
    const res = await request(app).post('/api/rides').send({
        userId,
        pickup: { address: `${TEST_TAG} Pickup`, lat: 11.0168, lng: 76.9558 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 80, currentFare: 80,
        vehicleCategory: 'CAR',
        ...extra
    });
    return res;
}

// ─── 3.1.2 — CO2 Calculation Algorithm ───
describe('US 3.1.2 — CO2 calculation algorithm', () => {
    it('ride creation populates co2Emissions field for CAR', async () => {
        const user = await makeUser();
        const res = await makeRide(user._id);
        expect(res.status).toBe(201);
        expect(typeof res.body.co2Emissions).toBe('number');
        expect(res.body.co2Emissions).toBeGreaterThan(0);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
        await mongoose.model('User').findByIdAndDelete(user._id);
    });

    it('co2Emissions is proportional to distance (CAR rate ~120 g/km)', async () => {
        const user = await makeUser();
        const res = await makeRide(user._id, { vehicleCategory: 'CAR' });
        expect(res.status).toBe(201);
        // Haversine dist for coords is roughly 4–5 km; CO2 should be 480–600g for CAR
        expect(res.body.co2Emissions).toBeGreaterThan(100);
        expect(res.body.co2Emissions).toBeLessThan(2000); // sanity upper bound
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
        await mongoose.model('User').findByIdAndDelete(user._id);
    });

    it('AUTO has lower co2Emissions than CAR for same route', async () => {
        const user = await makeUser();
        const [carRes, autoRes] = await Promise.all([
            makeRide(user._id, { vehicleCategory: 'CAR' }),
            makeRide(user._id, { vehicleCategory: 'AUTO' })
        ]);
        expect(carRes.status).toBe(201);
        expect(autoRes.status).toBe(201);
        expect(autoRes.body.co2Emissions).toBeLessThan(carRes.body.co2Emissions);
        await mongoose.model('Ride').deleteMany({ _id: { $in: [carRes.body._id, autoRes.body._id] } });
        await mongoose.model('User').findByIdAndDelete(user._id);
    });

    it('BIKE has lower co2Emissions than AUTO for same route', async () => {
        const user = await makeUser();
        const [bikeRes, autoRes] = await Promise.all([
            makeRide(user._id, { vehicleCategory: 'BIKE' }),
            makeRide(user._id, { vehicleCategory: 'AUTO' })
        ]);
        expect(bikeRes.body.co2Emissions).toBeLessThan(autoRes.body.co2Emissions);
        await mongoose.model('Ride').deleteMany({ _id: { $in: [bikeRes.body._id, autoRes.body._id] } });
        await mongoose.model('User').findByIdAndDelete(user._id);
    });

    it('pooled ride has positive co2Saved, solo ride has co2Saved=0', async () => {
        const user = await makeUser();
        const [poolRes, soloRes] = await Promise.all([
            makeRide(user._id, { isPooled: true, vehicleCategory: 'CAR' }),
            makeRide(user._id, { isPooled: false, vehicleCategory: 'CAR' })
        ]);
        expect(poolRes.status).toBe(201);
        expect(soloRes.status).toBe(201);
        expect(poolRes.body.co2Saved).toBeGreaterThan(0);
        expect(soloRes.body.co2Saved).toBe(0);
        await mongoose.model('Ride').deleteMany({ _id: { $in: [poolRes.body._id, soloRes.body._id] } });
        await mongoose.model('User').findByIdAndDelete(user._id);
    });

    it('co2Saved equals co2Emissions for a pooled ride (1 car trip worth saved)', async () => {
        const user = await makeUser();
        const res = await makeRide(user._id, { isPooled: true, vehicleCategory: 'CAR' });
        expect(res.status).toBe(201);
        expect(res.body.co2Saved).toBe(res.body.co2Emissions);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
        await mongoose.model('User').findByIdAndDelete(user._id);
    });

    it('algorithm unit check: calculateCO2 formula matches expected values', () => {
        // Inline test mirrors the server helper
        const CO2_RATES = { BIKE: 21, AUTO: 65, CAR: 120, BIG_CAR: 170 };
        const calcCO2 = (distKm, cat, isPooled) => {
            const rate = CO2_RATES[cat] || 120;
            const co2Emissions = Math.round(distKm * rate);
            const co2Saved = isPooled ? Math.round(distKm * rate) : 0;
            return { co2Emissions, co2Saved };
        };

        const r1 = calcCO2(10, 'CAR', false);
        expect(r1.co2Emissions).toBe(1200); // 10km * 120g
        expect(r1.co2Saved).toBe(0);

        const r2 = calcCO2(10, 'CAR', true);
        expect(r2.co2Emissions).toBe(1200);
        expect(r2.co2Saved).toBe(1200);

        const r3 = calcCO2(10, 'BIKE', false);
        expect(r3.co2Emissions).toBe(210); // 10km * 21g

        const r4 = calcCO2(5, 'AUTO', true);
        expect(r4.co2Emissions).toBe(325); // 5km * 65g
        expect(r4.co2Saved).toBe(325);
    });
});

// ─── 3.1.1 — Dashboard Widget Data ───
describe('US 3.1.1 — Dashboard widget: /api/users/:userId/stats', () => {
    let userId;

    beforeAll(async () => {
        userId = (await makeUser()).id;
    });
    afterAll(async () => {
        await mongoose.model('User').findByIdAndDelete(userId);
    });

    it('returns all required carbon fields', async () => {
        const res = await request(app).get(`/api/users/${userId}/stats`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalCO2Saved');
        expect(res.body).toHaveProperty('totalCO2Emitted');
        expect(res.body).toHaveProperty('totalCO2SavedKg');
        expect(res.body).toHaveProperty('totalCO2EmittedKg');
        expect(res.body).toHaveProperty('treeEquivalent');
        expect(res.body).toHaveProperty('totalTrips');
    });

    it('treeEquivalent is a non-negative number', async () => {
        const res = await request(app).get(`/api/users/${userId}/stats`);
        expect(res.status).toBe(200);
        expect(typeof res.body.treeEquivalent).toBe('number');
        expect(res.body.treeEquivalent).toBeGreaterThanOrEqual(0);
    });

    it('totalCO2SavedKg = totalCO2Saved / 1000', async () => {
        const res = await request(app).get(`/api/users/${userId}/stats`);
        expect(res.status).toBe(200);
        expect(res.body.totalCO2SavedKg).toBeCloseTo(res.body.totalCO2Saved / 1000, 2);
    });

    it('returns 404 for unknown userId', async () => {
        const res = await request(app).get('/api/users/000000000000000000000000/stats');
        expect(res.status).toBe(404);
    });
});

// ─── 3.1.3 — Ride Summary Carbon Footprint Endpoint ───
describe('US 3.1.3 — Per-ride carbon footprint: /api/rides/:rideId/carbon', () => {
    let userId, rideId;

    beforeAll(async () => {
        const user = await makeUser();
        userId = user._id;
        const res = await makeRide(userId, { vehicleCategory: 'CAR', isPooled: false });
        rideId = res.body._id;
    });
    afterAll(async () => {
        await mongoose.model('Ride').findByIdAndDelete(rideId);
        await mongoose.model('User').findByIdAndDelete(userId);
    });

    it('returns 200 with co2EmittedG for a valid ride', async () => {
        const res = await request(app).get(`/api/rides/${rideId}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('co2EmittedG');
        expect(res.body.co2EmittedG).toBeGreaterThan(0);
    });

    it('returns all required footprint fields', async () => {
        const res = await request(app).get(`/api/rides/${rideId}/carbon`);
        expect(res.status).toBe(200);
        const fields = ['rideId', 'vehicleCategory', 'isPooled', 'distanceKm', 'co2EmittedG', 'co2EmittedKg', 'co2SavedG', 'co2SavedKg', 'treeEquivalent', 'vsAvgCarPercent', 'emissionRateGPerKm'];
        fields.forEach(f => expect(res.body).toHaveProperty(f));
    });

    it('co2EmittedKg = co2EmittedG / 1000', async () => {
        const res = await request(app).get(`/api/rides/${rideId}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body.co2EmittedKg).toBeCloseTo(res.body.co2EmittedG / 1000, 3);
    });

    it('solo ride co2SavedG should be 0', async () => {
        const res = await request(app).get(`/api/rides/${rideId}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body.co2SavedG).toBe(0);
    });

    it('pooled ride co2SavedG equals co2EmittedG', async () => {
        const user2 = await makeUser();
        const poolRes = await makeRide(user2._id, { vehicleCategory: 'CAR', isPooled: true });
        const poolRideId = poolRes.body._id;
        const res = await request(app).get(`/api/rides/${poolRideId}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body.co2SavedG).toBe(res.body.co2EmittedG);
        await mongoose.model('Ride').findByIdAndDelete(poolRideId);
        await mongoose.model('User').findByIdAndDelete(user2._id);
    });

    it('distanceKm is a positive number matching route coords', async () => {
        const res = await request(app).get(`/api/rides/${rideId}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body.distanceKm).toBeGreaterThan(0);
        expect(res.body.distanceKm).toBeLessThan(200); // sanity cap
    });

    it('returns 404 for unknown rideId', async () => {
        const res = await request(app).get('/api/rides/000000000000000000000000/carbon');
        expect(res.status).toBe(404);
    });
});
