/**
 * Tests for User Story 1.5 — Opt out of pooling
 * PATCH /api/rides/:rideId/opt-out-pool
 *
 * Uses the same server app import pattern as feature3-maps-routing.test.js
 * so rides are created in the same MongoDB the server uses.
 */

let app, request, mongoose;

const TEST_TAG = 'Vitest_US15';

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
        await User.deleteMany({ email: new RegExp('vitest_us15') });
    } catch (_) {}
});

async function createTestUser() {
    const User = mongoose.model('User');
    const user = new User({
        role: 'RIDER',
        email: `vitest_us15_${Date.now()}@test.com`,
        phone: '9999900001',
        firstName: 'PoolOpt',
        lastName: 'Tester',
        dob: '2000-06-15',
        gender: 'Male',
    });
    const saved = await user.save();
    return saved._id.toString();
}

async function createPooledRide(userId, overrides = {}) {
    const Ride = mongoose.model('Ride');
    const ride = new Ride({
        userId,
        pickup: { address: `${TEST_TAG} Kochi`, lat: 9.9312, lng: 76.2673 },
        dropoff: { address: `${TEST_TAG} Kottayam`, lat: 9.5916, lng: 76.5222 },
        status: 'SEARCHING',
        isPooled: true,
        fare: 100,
        currentFare: 100,
        vehicleCategory: 'CAR',
        ...overrides,
    });
    return ride.save();
}

describe('US 1.5 — PATCH /api/rides/:rideId/opt-out-pool', () => {
    let userId;

    beforeAll(async () => {
        userId = await createTestUser();
    });

    afterAll(async () => {
        try {
            const User = mongoose.model('User');
            await User.findByIdAndDelete(userId);
        } catch (_) {}
    });

    it('1.5-A: returns 404 for a non-existent ride ID', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .patch(`/api/rides/${fakeId}/opt-out-pool`)
            .send();
        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/not found/i);
    });

    it('1.5-B: returns 400 if ride is not in SEARCHING state', async () => {
        const ride = await createPooledRide(userId, { status: 'ACCEPTED' });
        const res = await request(app)
            .patch(`/api/rides/${ride._id}/opt-out-pool`)
            .send();
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/not in SEARCHING/i);
    });

    it('1.5-C: returns 400 if ride is already a solo ride', async () => {
        const ride = await createPooledRide(userId, { isPooled: false });
        const res = await request(app)
            .patch(`/api/rides/${ride._id}/opt-out-pool`)
            .send();
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already a solo/i);
    });

    it('1.5-D: converts pooled ride to solo and computes correct solo fare', async () => {
        const ride = await createPooledRide(userId, { fare: 100, currentFare: 100 });
        const res = await request(app)
            .patch(`/api/rides/${ride._id}/opt-out-pool`)
            .send();
        await mongoose.model('Ride').findByIdAndDelete(ride._id);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        // Pool fare 100 / 0.67 ≈ 149
        expect(res.body.soloFare).toBeGreaterThan(100);
        expect(res.body.soloFare).toBeGreaterThanOrEqual(148);
        expect(res.body.soloFare).toBeLessThanOrEqual(150);
        expect(res.body.ride.isPooled).toBe(false);
        expect(res.body.ride.fare).toBe(res.body.soloFare);
        expect(res.body.ride.currentFare).toBe(res.body.soloFare);
    });

    it('1.5-E: accepts an explicit soloFare from the client', async () => {
        const ride = await createPooledRide(userId, { fare: 100, currentFare: 100 });
        const res = await request(app)
            .patch(`/api/rides/${ride._id}/opt-out-pool`)
            .send({ soloFare: 180 });
        await mongoose.model('Ride').findByIdAndDelete(ride._id);

        expect(res.status).toBe(200);
        expect(res.body.soloFare).toBe(180);
        expect(res.body.ride.fare).toBe(180);
        expect(res.body.ride.currentFare).toBe(180);
        expect(res.body.ride.isPooled).toBe(false);
    });

    it('1.5-F: persists isPooled=false and updated fare in the database', async () => {
        const ride = await createPooledRide(userId, { fare: 134, currentFare: 134 });
        await request(app)
            .patch(`/api/rides/${ride._id}/opt-out-pool`)
            .send();

        const updated = await mongoose.model('Ride').findById(ride._id);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);

        expect(updated.isPooled).toBe(false);
        // 134 / 0.67 ≈ 200
        expect(updated.fare).toBeGreaterThan(134);
        expect(updated.currentFare).toBeGreaterThan(134);
    });

    it('1.5-G: returns 200 with valid response shape', async () => {
        const ride = await createPooledRide(userId, { fare: 80, currentFare: 80 });
        const res = await request(app)
            .patch(`/api/rides/${ride._id}/opt-out-pool`)
            .send();
        await mongoose.model('Ride').findByIdAndDelete(ride._id);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('soloFare');
        expect(typeof res.body.soloFare).toBe('number');
        expect(res.body).toHaveProperty('ride');
        expect(res.body.ride).toHaveProperty('_id');
        expect(res.body.ride).toHaveProperty('isPooled', false);
    });
});
