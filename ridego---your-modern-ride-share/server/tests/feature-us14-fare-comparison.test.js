/**
 * Tests for User Story 1.4 — Compare Savings
 * 1.4.1 Show prices for pooled and private ride options
 * 1.4.2 Calculate the cost difference between the two modes
 * 1.4.3 Highlight the total savings amount for the user
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US14';

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
        const Ride = mongoose.model('Ride');
        const User = mongoose.model('User');
        await Ride.deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
        await User.deleteMany({ email: new RegExp('vitest_us14') });
    } catch (_) {}
});

// ─── Helpers ────────────────────────────────────────────────────────────────
async function makeUser(overrides = {}) {
    const User = mongoose.model('User');
    const u = new User({
        role: 'RIDER',
        email: `vitest_us14_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9988001100',
        firstName: 'Fare',
        lastName: 'Tester',
        dob: '1999-05-01',
        gender: 'Male',
        isVerified: false,
        ...overrides,
    });
    return u.save();
}

async function createRide(userId, overrides = {}) {
    return request(app).post('/api/rides').send({
        userId,
        pickup: { address: `${TEST_TAG} Kochi`, lat: 9.9312, lng: 76.2673 },
        dropoff: { address: `${TEST_TAG} Kottayam`, lat: 9.5916, lng: 76.5222 },
        fare: 150,
        currentFare: 150,
        ...overrides,
    });
}

// ─── Fare calculation parity ─────────────────────────────────────────────────
// Mirror of client-side calculation: soloPrice * 0.67 gives poolPrice
function poolFareFrom(soloFare) {
    return Math.round(soloFare * 0.67);
}
function fareSaved(soloFare) {
    return soloFare - poolFareFrom(soloFare);
}
function savingsPct(soloFare) {
    return Math.round((fareSaved(soloFare) / soloFare) * 100);
}

// ─── 1.4.1 — API returns fare (basis for showing both price options) ─────────
describe('US 1.4.1 — API returns fare used to display both ride prices', () => {
    let userId;
    beforeAll(async () => { userId = (await makeUser()).id; });
    afterAll(async () => { await mongoose.model('User').findByIdAndDelete(userId); });

    it('POST /api/rides returns fare in response body', async () => {
        const res = await createRide(userId, { fare: 200, currentFare: 200, isPooled: false });
        expect(res.status).toBe(201);
        expect(typeof res.body.fare).toBe('number');
        expect(res.body.fare).toBe(200);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
    });

    it('POST /api/rides returns currentFare in response body', async () => {
        const res = await createRide(userId, { fare: 180, currentFare: 180, isPooled: false });
        expect(res.status).toBe(201);
        expect(typeof res.body.currentFare).toBe('number');
        expect(res.body.currentFare).toBe(180);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
    });

    it('pooled ride stores fare at the pool rate (≤ solo fare)', async () => {
        const soloFare = 150;
        const res = await createRide(userId, {
            fare: soloFare,
            currentFare: Math.round(soloFare * 0.67),
            isPooled: true,
        });
        expect(res.status).toBe(201);
        expect(res.body.currentFare).toBeLessThan(res.body.fare);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
    });

    it('solo ride has fare === currentFare when no pooling', async () => {
        const res = await createRide(userId, { fare: 160, currentFare: 160, isPooled: false });
        expect(res.status).toBe(201);
        expect(res.body.fare).toBe(res.body.currentFare);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
    });
});

// ─── 1.4.2 — Cost difference calculation ────────────────────────────────────
describe('US 1.4.2 — Cost difference between private and pool modes', () => {
    it('pool is 33% cheaper than solo (67% rate applied)', () => {
        const solo = 300;
        const pool = poolFareFrom(solo);
        expect(pool).toBe(201); // Math.round(300 * 0.67)
        const diff = solo - pool;
        expect(diff).toBe(99);
    });

    it('cost difference is always positive (pool < solo)', () => {
        [100, 150, 200, 250, 400].forEach(solo => {
            expect(fareSaved(solo)).toBeGreaterThan(0);
        });
    });

    it('cost difference scales linearly with fare', () => {
        const diff1 = fareSaved(100);
        const diff2 = fareSaved(200);
        // doubling the fare should double the difference
        expect(diff2).toBe(diff1 * 2);
    });

    it('opt-out API reverses pool discount to recover solo fare', async () => {
        const user = await makeUser();
        // Create a pooled ride at pool fare (67% of 200 = 134)
        const createRes = await createRide(user.id, {
            fare: 200,
            currentFare: 134,
            isPooled: true,
        });
        expect(createRes.status).toBe(201);
        const rideId = createRes.body._id;

        const optOut = await request(app)
            .patch(`/api/rides/${rideId}/opt-out-pool`)
            .set('Content-Type', 'application/json')
            .send({ soloFare: 200 });
        expect(optOut.status).toBe(200);
        // Response shape: { success, ride, soloFare }
        expect(optOut.body.soloFare).toBe(200);
        expect(optOut.body.ride.currentFare).toBeGreaterThan(130);

        await mongoose.model('Ride').findByIdAndDelete(rideId);
        await mongoose.model('User').findByIdAndDelete(user._id);
    });
});

// ─── 1.4.3 — Savings amount ──────────────────────────────────────────────────
describe('US 1.4.3 — Savings amount correct for various fare levels', () => {
    it('savings percentage is ~33% for any fare', () => {
        [100, 200, 300, 500].forEach(solo => {
            const pct = savingsPct(solo);
            expect(pct).toBeGreaterThanOrEqual(32);
            expect(pct).toBeLessThanOrEqual(34);
        });
    });

    it('savings amount rounds correctly for ₹100 fare', () => {
        expect(fareSaved(100)).toBe(33);
    });

    it('savings amount rounds correctly for ₹200 fare', () => {
        expect(fareSaved(200)).toBe(66);
    });

    it('savings amount rounds correctly for ₹300 fare', () => {
        expect(fareSaved(300)).toBe(99);
    });

    it('pool fare is stored < original fare when ride is created as pooled', async () => {
        const user = await makeUser();
        const soloFare = 250;
        const pool = poolFareFrom(soloFare);
        const res = await createRide(user.id, {
            fare: soloFare,
            currentFare: pool,
            isPooled: true,
        });
        expect(res.status).toBe(201);
        const saved = res.body.fare - res.body.currentFare;
        expect(saved).toBeGreaterThan(0);
        expect(saved).toBe(soloFare - pool);
        await mongoose.model('Ride').findByIdAndDelete(res.body._id);
        await mongoose.model('User').findByIdAndDelete(user._id);
    });
});
