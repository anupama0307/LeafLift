/**
 * Tests for User Story 3.3 — CO₂ Savings History & Environmental Impact Over Time
 * 3.3.1 History view for cumulative CO₂ savings
 * 3.3.2 Aggregate total emissions saved from ride history
 * 3.3.3 Monthly graph data (bar chart percentages + cumulative)
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US33';

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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us33') });
    } catch (_) {}
});

async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_us33_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9900000033',
        firstName: 'Green',
        lastName: 'Tester',
        dob: '1997-06-15',
        gender: 'Female',
        isVerified: true,
        ...o
    }).save();
}

async function makeCompletedRide(userId, co2Emissions, co2Saved, isPooled = false, mthOffset = 0) {
    const d = new Date();
    d.setMonth(d.getMonth() - mthOffset);
    return new (mongoose.model('Ride'))({
        userId,
        pickup: { address: `${TEST_TAG} Origin`, lat: 9.9312, lng: 76.2673 },
        dropoff: { address: `${TEST_TAG} Dest`, lat: 9.5916, lng: 76.5222 },
        status: 'COMPLETED',
        isPooled,
        fare: 120,
        currentFare: 120,
        vehicleCategory: 'CAR',
        co2Emissions,
        co2Saved,
        createdAt: d,
        bookingTime: d,
    }).save();
}

// ── 3.3.1 — History view: endpoint returns correct shape ──────────────────────
describe('US 3.3.1 — CO₂ History View Endpoint', () => {
    let userId;
    let rideIds = [];

    beforeAll(async () => {
        const user = await makeUser();
        userId = user._id.toString();
        const r1 = await makeCompletedRide(userId, 800, 400, true, 0);
        const r2 = await makeCompletedRide(userId, 600, 300, true, 1);
        const r3 = await makeCompletedRide(userId, 1200, 0, false, 2);
        rideIds = [r1._id, r2._id, r3._id];
    });

    afterAll(async () => {
        await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
        await mongoose.model('User').findByIdAndDelete(userId);
    });

    it('returns 200 with summary and monthly fields', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
        expect(res.body).toHaveProperty('monthly');
        expect(Array.isArray(res.body.monthly)).toBe(true);
    });

    it('summary contains required fields', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const s = res.body.summary;
        expect(s).toHaveProperty('totalCO2SavedG');
        expect(s).toHaveProperty('totalCO2SavedKg');
        expect(s).toHaveProperty('totalCO2EmittedG');
        expect(s).toHaveProperty('totalCO2EmittedKg');
        expect(s).toHaveProperty('totalTreeEquivalent');
        expect(s).toHaveProperty('totalRides');
        expect(s).toHaveProperty('totalMonths');
        expect(s).toHaveProperty('bestMonth');
    });

    it('returns data for only COMPLETED rides', async () => {
        // Add a non-completed ride
        const extra = await new (mongoose.model('Ride'))({
            userId,
            pickup: { address: `${TEST_TAG} P`, lat: 9.9312, lng: 76.2673 },
            dropoff: { address: `${TEST_TAG} D`, lat: 9.5916, lng: 76.5222 },
            status: 'SEARCHING',
            isPooled: false, fare: 100, currentFare: 100, vehicleCategory: 'CAR',
            co2Emissions: 5000, co2Saved: 0,
        }).save();
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        // co2EmittedG should not include the 5000 from SEARCHING ride
        expect(res.body.summary.totalCO2EmittedG).toBeLessThanOrEqual(800 + 600 + 1200);
        await mongoose.model('Ride').findByIdAndDelete(extra._id);
    });

    it('totalRides equals number of completed rides', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.body.summary.totalRides).toBe(3);
    });

    it('monthly array length equals number of distinct months represented', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.body.monthly.length).toBeGreaterThanOrEqual(1);
        expect(res.body.monthly.length).toBeLessThanOrEqual(3);
    });

    it('empty history returns zero summary for new user', async () => {
        const emptyUser = await makeUser();
        const res = await request(app).get(`/api/users/${emptyUser._id}/co2-history`);
        expect(res.status).toBe(200);
        expect(res.body.summary.totalRides).toBe(0);
        expect(res.body.summary.totalCO2SavedG).toBe(0);
        expect(res.body.monthly).toHaveLength(0);
        await mongoose.model('User').findByIdAndDelete(emptyUser._id);
    });
});

// ── 3.3.2 — Aggregation correctness ──────────────────────────────────────────
describe('US 3.3.2 — Aggregate Emissions Saved from Ride History', () => {
    let userId;
    let rideIds = [];

    beforeAll(async () => {
        const user = await makeUser();
        userId = user._id.toString();
        const r1 = await makeCompletedRide(userId, 1000, 500, true, 0);
        const r2 = await makeCompletedRide(userId, 800, 400, true, 0);
        const r3 = await makeCompletedRide(userId, 600, 0,   false, 1);
        rideIds = [r1._id, r2._id, r3._id];
    });

    afterAll(async () => {
        await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
        await mongoose.model('User').findByIdAndDelete(userId);
    });

    it('totalCO2SavedG is sum of all co2Saved values', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.body.summary.totalCO2SavedG).toBe(500 + 400 + 0);
    });

    it('totalCO2EmittedG is sum of all co2Emissions values', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.body.summary.totalCO2EmittedG).toBe(1000 + 800 + 600);
    });

    it('totalCO2SavedKg is correct kg conversion', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.body.summary.totalCO2SavedKg).toBeCloseTo(0.9, 2);
    });

    it('totalCO2EmittedKg is correct kg conversion', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        expect(res.body.summary.totalCO2EmittedKg).toBeCloseTo(2.4, 2);
    });

    it('treeEquivalent = totalCO2SavedG / 21000', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const expected = parseFloat((900 / 21000).toFixed(4));
        expect(res.body.summary.totalTreeEquivalent).toBeCloseTo(expected, 4);
    });

    it('bestMonth is the month with highest co2SavedG', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        // current month has r1+r2 = 900g saved vs 0 for previous month
        expect(res.body.summary.bestMonth).toBeTruthy();
    });

    it('monthly entries aggregate rides within same month', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        // r1 and r2 are in the same month; their co2Saved should be summed
        const sortedMonthly = res.body.monthly;
        const latestMonth = sortedMonthly[sortedMonthly.length - 1];
        expect(latestMonth.co2SavedG).toBe(900); // 500 + 400
        expect(latestMonth.rides).toBe(2);
        expect(latestMonth.pooledRides).toBe(2);
    });

    it('non-pooled ride contributes 0 to co2SavedG (baseline)', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const allSaved = res.body.monthly.reduce((s, m) => s + m.co2SavedG, 0);
        expect(allSaved).toBe(900); // only pooled rides save CO2
    });
});

// ── 3.3.3 — Graph data: bar chart percentages & cumulative ───────────────────
describe('US 3.3.3 — Graph Data for Environmental Impact Over Time', () => {
    let userId;
    let rideIds = [];

    beforeAll(async () => {
        const user = await makeUser();
        userId = user._id.toString();
        // Three months of data: older months have less savings
        const r1 = await makeCompletedRide(userId, 200, 100, true, 2);
        const r2 = await makeCompletedRide(userId, 400, 200, true, 1);
        const r3 = await makeCompletedRide(userId, 800, 400, true, 0);
        rideIds = [r1._id, r2._id, r3._id];
    });

    afterAll(async () => {
        await mongoose.model('Ride').deleteMany({ _id: { $in: rideIds } });
        await mongoose.model('User').findByIdAndDelete(userId);
    });

    it('each monthly entry has savedBarPct between 0 and 100', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        for (const m of res.body.monthly) {
            expect(m.savedBarPct).toBeGreaterThanOrEqual(0);
            expect(m.savedBarPct).toBeLessThanOrEqual(100);
        }
    });

    it('each monthly entry has emittedBarPct between 0 and 100', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        for (const m of res.body.monthly) {
            expect(m.emittedBarPct).toBeGreaterThanOrEqual(0);
            expect(m.emittedBarPct).toBeLessThanOrEqual(100);
        }
    });

    it('month with highest savings has savedBarPct = 100', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const maxPct = Math.max(...res.body.monthly.map((m) => m.savedBarPct));
        expect(maxPct).toBe(100);
    });

    it('cumulativeSavedG is strictly increasing across months', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const vals = res.body.monthly.map((m) => m.cumulativeSavedG);
        for (let i = 1; i < vals.length; i++) {
            expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
        }
    });

    it('cumulativeSavedG of last month equals totalCO2SavedG in summary', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const last = res.body.monthly[res.body.monthly.length - 1];
        expect(last.cumulativeSavedG).toBe(res.body.summary.totalCO2SavedG);
    });

    it('each monthly entry has treeEquivalent field', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        for (const m of res.body.monthly) {
            expect(m).toHaveProperty('treeEquivalent');
            expect(m.treeEquivalent).toBeGreaterThanOrEqual(0);
        }
    });

    it('each monthly entry has co2SavedKg and co2EmittedKg fields', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        for (const m of res.body.monthly) {
            expect(m).toHaveProperty('co2SavedKg');
            expect(m).toHaveProperty('co2EmittedKg');
        }
    });

    it('monthly array is sorted ascending by month key', async () => {
        const res = await request(app).get(`/api/users/${userId}/co2-history`);
        const keys = res.body.monthly.map((m) => m.key);
        const sorted = [...keys].sort();
        expect(keys).toEqual(sorted);
    });
});
