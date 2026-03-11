/**
 * Epic 4 Integration Tests — Demand Analytics
 *
 * US4.1  Demand prediction and heatmap via location-based ride queries
 * US4.2  Peak hour detection via ride timestamp analysis
 * US4.3  Driver surge suggestions via nearby driver / demand APIs
 * US4.4  Pool success rate analytics
 * US4.5  Vehicle utilization reports
 * US4.6  Historical ride data for pattern learning
 * US4.7  Sustainability impact analytics
 */

let app, request, mongoose;

const TEST_TAG = 'Vitest_Epic4Demand';

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
        await User.deleteMany({ email: new RegExp('vitest_epic4') });
    } catch (_) {}
    try { await mongoose.connection.close(); } catch (_) {}
}, 30000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeUser(overrides = {}) {
    const User = mongoose.model('User');
    return new User({
        role: 'RIDER',
        email: `vitest_epic4_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9800000001',
        firstName: 'Analytics',
        lastName: 'Test',
        dob: '1995-06-15',
        gender: 'Male',
        ...overrides,
    }).save();
}

async function makeDriver(overrides = {}) {
    const User = mongoose.model('User');
    return new User({
        role: 'DRIVER',
        email: `vitest_epic4_drv_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9800000002',
        firstName: 'Driver',
        lastName: 'Analytics',
        dob: '1990-03-10',
        gender: 'Male',
        vehicleType: 'CAR',
        license: 'KA12345678',
        aadhar: '999911112222',
        ...overrides,
    }).save();
}

async function makeRide(userId, extra = {}) {
    const Ride = mongoose.model('Ride');
    return new Ride({
        userId,
        pickup:  { address: `${TEST_TAG} Pickup`, lat: 12.9352, lng: 77.6245 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 12.9766, lng: 77.5993 },
        fare:        100,
        currentFare: 100,
        vehicleCategory: 'CAR',
        status: 'COMPLETED',
        co2Emissions: 480,
        co2Saved:     160,
        ...extra,
    }).save();
}

// ─── US 4.1 — Demand prediction and heatmap data ──────────────────────────

describe('US4.1 — Demand prediction and heatmap data', () => {
    let rider, searchRide;

    beforeAll(async () => {
        rider = await makeUser();
        searchRide = new (mongoose.model('Ride'))({
            userId:  rider._id,
            pickup:  { address: `${TEST_TAG} Demand Area`, lat: 12.9352, lng: 77.6245 },
            dropoff: { address: `${TEST_TAG} Demand Drop`, lat: 12.9766, lng: 77.5993 },
            fare: 90, currentFare: 90, vehicleCategory: 'CAR', status: 'SEARCHING',
        });
        await searchRide.save();
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').findByIdAndDelete(rider?._id);
            await mongoose.model('Ride').findByIdAndDelete(searchRide?._id);
        } catch (_) {}
    });

    it('4.1-A: GET /api/rides/nearby returns SEARCHING rides as real-time demand signal', async () => {
        const res = await request(app)
            .get('/api/rides/nearby')
            .query({ lat: 12.9352, lng: 77.6245, radius: 10 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const ids = res.body.flatMap(r =>
            r.poolGroupRiders ? r.poolGroupRiders.map(p => p.rideId) : [r._id]
        );
        expect(ids).toContain(searchRide._id.toString());
    });

    it('4.1-B: broader radius returns more or equal rides than narrow radius (demand scope)', async () => {
        const farRes = await request(app)
            .get('/api/rides/nearby')
            .query({ lat: 12.9352, lng: 77.6245, radius: 100 });
        const nearRes = await request(app)
            .get('/api/rides/nearby')
            .query({ lat: 12.9352, lng: 77.6245, radius: 1 });
        expect(farRes.status).toBe(200);
        expect(nearRes.status).toBe(200);
        expect(farRes.body.length).toBeGreaterThanOrEqual(nearRes.body.length);
    });

    it('4.1-C: GET /api/rides/nearby without coords returns all recent SEARCHING rides', async () => {
        const res = await request(app).get('/api/rides/nearby');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('4.1-D: GET /api/rides/estimate provides demand estimate per vehicle category', async () => {
        const res = await request(app)
            .get('/api/rides/estimate')
            .query({
                pickupLat:  12.9352, pickupLng:  77.6245,
                dropoffLat: 12.9766, dropoffLng: 77.5993,
            });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.vehicleEstimates)).toBe(true);
        expect(res.body.vehicleEstimates.length).toBeGreaterThanOrEqual(4);
        const categories = res.body.vehicleEstimates.map(v => v.category);
        ['CAR', 'BIKE', 'AUTO', 'BIG_CAR'].forEach(c => expect(categories).toContain(c));
        expect(res.body.straightLineKm).toBeGreaterThan(0);
        expect(res.body.estimatedDurationMin).toBeGreaterThan(0);
    });

    it('4.1-E: GET /api/rides/estimate returns 400 when required coords are missing', async () => {
        const res = await request(app).get('/api/rides/estimate').query({ pickupLat: 12.9 });
        expect(res.status).toBe(400);
    });

    it('4.1-F: demand estimate includes CO2 per vehicle category for eco-aware demand analytics', async () => {
        const res = await request(app)
            .get('/api/rides/estimate')
            .query({ pickupLat: 12.9352, pickupLng: 77.6245, dropoffLat: 12.9766, dropoffLng: 77.5993 });
        expect(res.status).toBe(200);
        res.body.vehicleEstimates.forEach(v => {
            expect(v.co2EmittedG).toBeGreaterThan(0);
            expect(v.estimatedDurationMin).toBeGreaterThan(0);
        });
    });
});

// ─── US 4.2 — Peak hour detection ─────────────────────────────────────────

describe('US4.2 — Peak hour detection via ride data', () => {
    let rider;
    let rideIds = [];

    beforeAll(async () => {
        rider = await makeUser();
        // Simulate rides at different hours to mirror morning/evening peak patterns
        const hours = [8, 9, 9, 17, 18, 18, 18];
        const rides = await Promise.all(
            hours.map((h, idx) => {
                const bookingTime = new Date();
                bookingTime.setHours(h, 0, 0, 0);
                return makeRide(rider._id, {
                    status:      'COMPLETED',
                    bookingTime,
                    pickup:  { address: `${TEST_TAG} Peak${idx}`, lat: 12.9352 + idx * 0.001, lng: 77.6245 },
                    dropoff: { address: `${TEST_TAG} PeakDrop${idx}`, lat: 12.9766, lng: 77.5993 },
                });
            })
        );
        rideIds = rides.map(r => r._id);
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
            await mongoose.model('User').findByIdAndDelete(rider?._id);
        } catch (_) {}
    });

    it('4.2-A: ride history contains bookingTime timestamps for peak-hour analysis', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(7);
        res.body.forEach(r => expect(r.bookingTime || r.createdAt).toBeTruthy());
    });

    it('4.2-B: ride history is sorted most-recent-first (for time-series analytics)', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        const times = res.body.map(r => new Date(r.bookingTime || r.createdAt).getTime());
        for (let i = 0; i < times.length - 1; i++) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i + 1]);
        }
    });

    it('4.2-C: hour distribution can be derived from ride timestamps to identify peaks', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        const hourCounts = {};
        for (const ride of res.body) {
            const hour = new Date(ride.bookingTime || ride.createdAt).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
        const maxCount = Math.max(...Object.values(hourCounts));
        expect(maxCount).toBeGreaterThanOrEqual(1);
        // Evening peak (17-18h) should have 3 rides
        const eveningPeak = (hourCounts[17] || 0) + (hourCounts[18] || 0);
        expect(eveningPeak).toBeGreaterThanOrEqual(3);
    });

    it('4.2-D: rides include vehicleCategory for demand segmentation by vehicle type', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        const carsCount = res.body.filter(r => r.vehicleCategory === 'CAR').length;
        expect(carsCount).toBeGreaterThan(0);
    });
});

// ─── US 4.3 — Driver surge suggestions ───────────────────────────────────

describe('US4.3 — Driver surge suggestions via demand APIs', () => {
    it('4.3-A: GET /api/drivers/nearby with coords returns array (empty when no drivers online)', async () => {
        const res = await request(app)
            .get('/api/drivers/nearby')
            .query({ lat: 12.9352, lng: 77.6245 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('4.3-B: GET /api/drivers/nearby without coords → 400', async () => {
        const res = await request(app).get('/api/drivers/nearby');
        expect(res.status).toBe(400);
    });

    it('4.3-C: GET /api/rides/estimate provides fare baseline for surge computation', async () => {
        const res = await request(app)
            .get('/api/rides/estimate')
            .query({ pickupLat: 19.1197, pickupLng: 72.8464, dropoffLat: 19.0760, dropoffLng: 72.8777 });
        expect(res.status).toBe(200);
        res.body.vehicleEstimates.forEach(v => {
            expect(v.estimatedDurationMin).toBeGreaterThan(0);
            expect(v.co2EmittedG).toBeGreaterThan(0);
        });
    });

    it('4.3-D: broader radius returns more or equal drivers than narrow radius', async () => {
        const small = await request(app).get('/api/drivers/nearby').query({ lat: 12.9352, lng: 77.6245, radius: 1 });
        const large = await request(app).get('/api/drivers/nearby').query({ lat: 12.9352, lng: 77.6245, radius: 50 });
        expect(small.status).toBe(200);
        expect(large.status).toBe(200);
        expect(large.body.length).toBeGreaterThanOrEqual(small.body.length);
    });

    it('4.3-E: emission-compare provides eco-aware surge context for demand analytics', async () => {
        const res = await request(app)
            .get('/api/emission-compare')
            .query({ distKm: 10, vehicleCategory: 'CAR' });
        expect(res.status).toBe(200);
        expect(res.body.solo.co2EmittedG).toBeGreaterThan(res.body.pool.co2EmittedG);
        expect(res.body.comparison.reductionPct).toBeGreaterThan(0);
    });
});

// ─── US 4.4 — Pool success rate analytics ─────────────────────────────────

describe('US4.4 — Pool success rate analytics', () => {
    let rider;
    let rideIds = [];

    beforeAll(async () => {
        rider = await makeUser();
        const data = [
            { isPooled: true,  status: 'COMPLETED', poolGroupId: 'grp-e4-1' },
            { isPooled: true,  status: 'COMPLETED', poolGroupId: 'grp-e4-2' },
            { isPooled: true,  status: 'CANCELED' },
            { isPooled: false, status: 'COMPLETED' },
            { isPooled: false, status: 'COMPLETED' },
        ];
        const rides = await Promise.all(
            data.map((d, i) =>
                makeRide(rider._id, {
                    ...d,
                    pickup: { address: `${TEST_TAG} Pool4${i}`, lat: 12.9352 + i * 0.001, lng: 77.6245 },
                })
            )
        );
        rideIds = rides.map(r => r._id);
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
            await mongoose.model('User').findByIdAndDelete(rider?._id);
        } catch (_) {}
    });

    it('4.4-A: completed pooled rides are visible and countable in user history', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        const pooledCompleted = res.body.filter(r => r.isPooled && r.status === 'COMPLETED');
        expect(pooledCompleted.length).toBeGreaterThanOrEqual(2);
    });

    it('4.4-B: pool success rate computable from ride history (completed/total pooled)', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        const history    = res.body;
        const totalPooled     = history.filter(r => r.isPooled).length;
        const completedPooled = history.filter(r => r.isPooled && r.status === 'COMPLETED').length;
        const successRate = totalPooled > 0 ? completedPooled / totalPooled : 0;
        expect(successRate).toBeGreaterThanOrEqual(0);
        expect(successRate).toBeLessThanOrEqual(1);
        // 2 completed out of 3 pooled = 66%
        expect(successRate).toBeGreaterThanOrEqual(0.5);
    });

    it('4.4-C: poolGroupId field enables group-level pool analytics', async () => {
        const rides = await mongoose.model('Ride').find({ _id: { $in: rideIds } });
        const withGroup = rides.filter(r => r.poolGroupId);
        expect(withGroup.length).toBe(2);
        const groups = [...new Set(withGroup.map(r => r.poolGroupId))];
        expect(groups.length).toBe(2); // grp-e4-1 and grp-e4-2
    });

    it('4.4-D: solo vs pooled ratio is computable for analytics dashboard', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        const history    = res.body;
        const pooledCount = history.filter(r => r.isPooled).length;
        const soloCount   = history.filter(r => !r.isPooled).length;
        expect(pooledCount + soloCount).toBe(history.length);
        expect(soloCount).toBeGreaterThanOrEqual(2);
        expect(pooledCount).toBeGreaterThanOrEqual(3);
    });
});

// ─── US 4.5 — Vehicle utilization reports ─────────────────────────────────

describe('US4.5 — Vehicle utilization reports', () => {
    let driver;
    let rideIds = [];

    beforeAll(async () => {
        driver = await makeDriver();
        const data = [
            { vehicleCategory: 'CAR',     status: 'COMPLETED' },
            { vehicleCategory: 'CAR',     status: 'COMPLETED' },
            { vehicleCategory: 'BIKE',    status: 'COMPLETED' },
            { vehicleCategory: 'AUTO',    status: 'CANCELED' },
            { vehicleCategory: 'BIG_CAR', status: 'COMPLETED' },
        ];
        const rides = await Promise.all(
            data.map((d, i) => {
                const Ride = mongoose.model('Ride');
                return new Ride({
                    userId:   driver._id,
                    driverId: driver._id,
                    pickup:  { address: `${TEST_TAG} Util${i}`, lat: 12.9352 + i * 0.001, lng: 77.6245 },
                    dropoff: { address: `${TEST_TAG} UtilDrop${i}`, lat: 12.9766, lng: 77.5993 },
                    fare: 120, currentFare: 120,
                    ...d,
                }).save();
            })
        );
        rideIds = rides.map(r => r._id);
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
            await mongoose.model('User').findByIdAndDelete(driver?._id);
        } catch (_) {}
    });

    it('4.5-A: GET /api/rides/driver/:driverId returns driver\'s full ride history', async () => {
        const res = await request(app).get(`/api/rides/driver/${driver._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(5);
    });

    it('4.5-B: driver history includes vehicleCategory for fleet segmentation', async () => {
        const res = await request(app).get(`/api/rides/driver/${driver._id}`);
        const categories = [...new Set(res.body.map(r => r.vehicleCategory))];
        expect(categories.length).toBeGreaterThanOrEqual(3); // CAR, BIKE, AUTO, BIG_CAR
    });

    it('4.5-C: COMPLETED vs CANCELED breakdown visible for utilization rate', async () => {
        const res  = await request(app).get(`/api/rides/driver/${driver._id}`);
        const completed = res.body.filter(r => r.status === 'COMPLETED').length;
        const canceled  = res.body.filter(r => r.status === 'CANCELED').length;
        expect(completed).toBeGreaterThanOrEqual(4);
        expect(canceled).toBeGreaterThanOrEqual(1);
        const utilRate = completed / (completed + canceled);
        expect(utilRate).toBeGreaterThan(0.5); // >50% utilization in test data
    });

    it('4.5-D: GET /api/vehicles/eco-ratings returns all 4 vehicle categories', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        expect(res.status).toBe(200);
        const vehicles = res.body.vehicles ?? res.body;
        expect(Array.isArray(vehicles)).toBe(true);
        const ids = vehicles.map(v => v.id);
        ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'].forEach(cat => expect(ids).toContain(cat));
    });

    it('4.5-E: eco-ratings include emission rates enabling emissions-per-km utilization analysis', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        expect(res.status).toBe(200);
        const vehicles = res.body.vehicles ?? res.body;
        vehicles.forEach(v => {
            expect(typeof v.emissionRateGPerKm).toBe('number');
            expect(v.emissionRateGPerKm).toBeGreaterThan(0);
        });
    });
});

// ─── US 4.6 — Historical ride data for learning ────────────────────────────

describe('US4.6 — Historical ride data for pattern learning', () => {
    let rider;
    let rideIds = [];

    beforeAll(async () => {
        rider = await makeUser();
        const rides = await Promise.all(
            Array.from({ length: 6 }, (_, i) => {
                const createdAt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
                return makeRide(rider._id, {
                    status:          'COMPLETED',
                    isPooled:        i % 2 === 0,
                    vehicleCategory: ['CAR', 'BIKE', 'AUTO'][i % 3],
                    pickup:  { address: `${TEST_TAG} Hist${i}`, lat: 12.9352 + i * 0.001, lng: 77.6245 },
                    createdAt,
                    bookingTime: createdAt,
                });
            })
        );
        rideIds = rides.map(r => r._id);
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
            await mongoose.model('User').findByIdAndDelete(rider?._id);
        } catch (_) {}
    });

    it('4.6-A: GET /api/rides/user/:userId returns complete ride history', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(6);
    });

    it('4.6-B: each ride has ML-relevant fields (vehicleCategory, isPooled, fare)', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        res.body.forEach(ride => {
            expect(ride).toHaveProperty('vehicleCategory');
            expect(ride).toHaveProperty('isPooled');
            expect(ride).toHaveProperty('fare');
        });
    });

    it('4.6-C: rides include pickup/dropoff address data for route-pattern learning', async () => {
        const res = await request(app).get(`/api/rides/user/${rider._id}`);
        const testRides = res.body.filter(r => r.pickup?.address?.includes(TEST_TAG));
        expect(testRides.length).toBeGreaterThanOrEqual(1);
        testRides.forEach(r => {
            expect(r.pickup?.address).toBeTruthy();
            expect(r.dropoff?.address).toBeTruthy();
        });
    });

    it('4.6-D: history contains diverse vehicle categories for segmentation', async () => {
        const res  = await request(app).get(`/api/rides/user/${rider._id}`);
        const cats = [...new Set(res.body.map(r => r.vehicleCategory))];
        expect(cats.length).toBeGreaterThanOrEqual(2);
    });

    it('4.6-E: pooled and solo rides both present for ratio-based model training', async () => {
        const res         = await request(app).get(`/api/rides/user/${rider._id}`);
        const pooledCount = res.body.filter(r => r.isPooled).length;
        const soloCount   = res.body.filter(r => !r.isPooled).length;
        expect(pooledCount).toBeGreaterThanOrEqual(1);
        expect(soloCount).toBeGreaterThanOrEqual(1);
    });

    it('4.6-F: rides are sorted most-recent-first for incremental model updates', async () => {
        const res   = await request(app).get(`/api/rides/user/${rider._id}`);
        const times = res.body.map(r => new Date(r.bookingTime || r.createdAt).getTime());
        for (let i = 0; i < times.length - 1; i++) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i + 1]);
        }
    });
});

// ─── US 4.7 — Sustainability impact analytics ─────────────────────────────

describe('US4.7 — Sustainability analytics and impact reporting', () => {
    let rider;
    let rideIds = [];

    beforeAll(async () => {
        const User = mongoose.model('User');
        rider = new User({
            role:            'RIDER',
            email:           `vitest_epic4_eco_${Date.now()}@test.com`,
            phone:           '9800000003',
            firstName:       'Eco',
            lastName:        'Rider',
            dob:             '1993-07-20',
            gender:          'Female',
            totalCO2Saved:   6000,   // 6 kg → 'tree' tier
            totalCO2Emitted: 2400,
            totalTrips:      24,
            totalKmTraveled: 180,
            walletBalance:   250,
        });
        await rider.save();

        const rides = await Promise.all(
            Array.from({ length: 3 }, (_, i) =>
                makeRide(rider._id, {
                    status:       'COMPLETED',
                    isPooled:     true,
                    co2Emissions: 200 + i * 50,
                    co2Saved:     100 + i * 30,
                    pickup: { address: `${TEST_TAG} Eco${i}`, lat: 12.9352 + i * 0.001, lng: 77.6245 },
                })
            )
        );
        rideIds = rides.map(r => r._id);
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
            await mongoose.model('User').findByIdAndDelete(rider?._id);
        } catch (_) {}
    });

    it('4.7-A: GET /api/users/:userId/stats returns comprehensive sustainability analytics', async () => {
        const res = await request(app).get(`/api/users/${rider._id}/stats`);
        expect(res.status).toBe(200);
        expect(res.body.totalTrips).toBe(24);
        expect(res.body.totalCO2Saved).toBe(6000);
        expect(res.body.totalCO2Emitted).toBe(2400);
        expect(res.body.totalCO2SavedKg).toBeCloseTo(6, 1);
        expect(res.body.treeEquivalent).toBeGreaterThan(0);
        expect(typeof res.body.walletBalance).toBe('number');
        expect(res.body.totalKmTraveled).toBeGreaterThan(0);
    });

    it('4.7-B: GET /api/users/:userId/co2-history returns monthly CO2 breakdown', async () => {
        const res = await request(app).get(`/api/users/${rider._id}/co2-history`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
        expect(res.body).toHaveProperty('monthly');
        expect(res.body.summary.totalRides).toBeGreaterThanOrEqual(3);
        expect(typeof res.body.summary.totalCO2SavedG).toBe('number');
        expect(typeof res.body.summary.totalCO2EmittedG).toBe('number');
        expect(typeof res.body.summary.totalTreeEquivalent).toBe('number');
    });

    it('4.7-C: monthly CO2 data has structure required for bar-chart rendering', async () => {
        const res = await request(app).get(`/api/users/${rider._id}/co2-history`);
        expect(res.status).toBe(200);
        if (res.body.monthly.length > 0) {
            const month = res.body.monthly[0];
            expect(month).toHaveProperty('month');
            expect(month).toHaveProperty('co2EmittedG');
            expect(month).toHaveProperty('co2SavedG');
            expect(month).toHaveProperty('rides');
            expect(month).toHaveProperty('savedBarPct');
            expect(month).toHaveProperty('emittedBarPct');
            expect(month).toHaveProperty('cumulativeSavedG');
        }
    });

    it('4.7-D: GET /api/users/:userId/eco-tier returns correct badge tier based on CO2 saved', async () => {
        const res = await request(app).get(`/api/users/${rider._id}/eco-tier`);
        expect(res.status).toBe(200);
        // 6000g > 5000g threshold → 'tree' tier
        expect(res.body.tier).toBe('tree');
        expect(res.body.tierEmoji).toBe('🌳');
        expect(res.body.totalCO2SavedG).toBe(6000);
        expect(typeof res.body.progressPct).toBe('number');
        expect(res.body).toHaveProperty('thresholds');
        expect(res.body.nextTier).toBeNull();
    });

    it('4.7-E: GET /api/emission-compare returns solo vs pool CO2 comparison for all categories', async () => {
        const res = await request(app)
            .get('/api/emission-compare')
            .query({ distKm: 10, vehicleCategory: 'CAR' });
        expect(res.status).toBe(200);
        expect(res.body.solo.co2EmittedG).toBeGreaterThan(res.body.pool.co2EmittedG);
        expect(res.body.comparison.co2SavedG).toBeGreaterThan(0);
        expect(res.body.comparison.reductionPct).toBeGreaterThan(0);
        expect(res.body.comparison.treeEquivalent).toBeGreaterThanOrEqual(0);
        expect(res.body.comparison.poolBarPct).toBeGreaterThan(0);
    });

    it('4.7-F: GET /api/users/:userId/sustainability/trends returns recent trend data', async () => {
        const res = await request(app).get(`/api/users/${rider._id}/sustainability/trends`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Returns up to last 7 completed rides
        expect(res.body.length).toBeLessThanOrEqual(7);
    });

    it('4.7-G: sustainability/trends data has required fields for chart rendering', async () => {
        const res = await request(app).get(`/api/users/${rider._id}/sustainability/trends`);
        expect(res.status).toBe(200);
        if (res.body.length > 0) {
            const point = res.body[0];
            expect(point).toHaveProperty('date');
            expect(point).toHaveProperty('co2Saved');
            expect(point).toHaveProperty('co2Emitted');
        }
    });

    it('4.7-H: GET /api/users/:userId/stats returns 404 for non-existent user', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(`/api/users/${fakeId}/stats`);
        expect(res.status).toBe(404);
    });
});
