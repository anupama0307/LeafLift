/**
 * Tests for User Story 2.2 — Live ETA Countdown on Active Ride Screen
 *
 * 2.2.1  ETA label on the active ride card — endpoint returns remainingMinutes & shape.
 * 2.2.2  Calculate remaining time from ride startedAt + originalEtaMinutes.
 * 2.2.3  Endpoint accessible for 60-second refresh polling (no auth, stable response).
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US22';

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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us22') });
    } catch (_) {}
    await mongoose.connection.close();
});

// ─── helpers ───────────────────────────────────────────────────────────────
async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_us22_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9876543210',
        firstName: 'ETA', lastName: 'Tester',
        dob: '1998-05-15', gender: 'Male', isVerified: false,
        ...o
    }).save();
}

// Create a ride document directly with given status + timing fields
async function makeRide(userId, extra = {}) {
    return new (mongoose.model('Ride'))({
        userId,
        pickup: { address: `${TEST_TAG} Pickup`, lat: 11.0168, lng: 76.9558 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 90, currentFare: 90,
        vehicleCategory: 'CAR',
        status: 'SEARCHING',
        ...extra
    }).save();
}

const BASE = (rideId) => `/api/rides/${rideId}/arrival-eta`;

// ══════════════════════════════════════════════════════════════════════════════
// US 2.2.1 — ETA label on active ride card (response shape)
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.2.1 — ETA label shape on active ride card', () => {
    it('GET /api/rides/:rideId/arrival-eta returns 404 for unknown ride ID', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.status).toBe(404);
    });

    it('404 response has message field', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.body).toHaveProperty('message');
    });

    it('returns 200 for non-IN_PROGRESS ride with remainingMinutes: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ACCEPTED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('non-IN_PROGRESS response contains status field', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ARRIVED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ARRIVED');
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('IN_PROGRESS ride with startedAt returns all required fields', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 15
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('remainingMinutes');
        expect(res.body).toHaveProperty('elapsedMinutes');
        expect(res.body).toHaveProperty('originalEtaMinutes');
        expect(res.body).toHaveProperty('estimatedArrivalTime');
        expect(res.body).toHaveProperty('startedAt');
        expect(res.body).toHaveProperty('status', 'IN_PROGRESS');
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('remainingMinutes is a non-negative number for a freshly started ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(typeof res.body.remainingMinutes).toBe('number');
        expect(res.body.remainingMinutes).toBeGreaterThanOrEqual(0);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('elapsedMinutes is a non-negative integer for a fresh ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 10
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.elapsedMinutes).toBeGreaterThanOrEqual(0);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime is an ISO string', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 12
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        const parsed = new Date(res.body.estimatedArrivalTime);
        expect(Number.isNaN(parsed.getTime())).toBe(false);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('originalEtaMinutes matches what was set on the ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 18
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.originalEtaMinutes).toBe(18);
        await ride.deleteOne();
        await user.deleteOne();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.2.2 — Remaining time calculated from startedAt + originalEtaMinutes
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.2.2 — Remaining time calculation from startedAt + originalEtaMinutes', () => {
    it('remainingMinutes ≈ originalEtaMinutes for a ride started seconds ago', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),      // just now
            originalEtaMinutes: 25
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.remainingMinutes).toBeGreaterThanOrEqual(24);
        expect(res.body.remainingMinutes).toBeLessThanOrEqual(25);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('remainingMinutes decreases as elapsed time increases', async () => {
        const user = await makeUser();
        // Ride started 10 minutes ago, eta was 20 minutes → ~10 remaining
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: tenMinAgo,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.remainingMinutes).toBeGreaterThanOrEqual(9);
        expect(res.body.remainingMinutes).toBeLessThanOrEqual(11);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('remainingMinutes is 0 when elapsed ≥ originalEtaMinutes (overdue ride)', async () => {
        const user = await makeUser();
        // Ride started 30 minutes ago, eta was only 20 minutes
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: thirtyMinAgo,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.remainingMinutes).toBe(0);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('elapsedMinutes ≈ 10 for a ride started 10 minutes ago', async () => {
        const user = await makeUser();
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: tenMinAgo,
            originalEtaMinutes: 30
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.elapsedMinutes).toBeGreaterThanOrEqual(10);
        expect(res.body.elapsedMinutes).toBeLessThanOrEqual(11);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime = startedAt + originalEtaMinutes', async () => {
        const user = await makeUser();
        const startedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
        const originalEtaMinutes = 15;
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt,
            originalEtaMinutes
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        const expected = new Date(startedAt.getTime() + originalEtaMinutes * 60000);
        const actual = new Date(res.body.estimatedArrivalTime);
        // Allow 5-second tolerance
        expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThan(5000);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('remainingMinutes + elapsedMinutes ≈ originalEtaMinutes', async () => {
        const user = await makeUser();
        const eightMinAgo = new Date(Date.now() - 8 * 60 * 1000);
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: eightMinAgo,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        const sum = res.body.remainingMinutes + res.body.elapsedMinutes;
        expect(sum).toBeGreaterThanOrEqual(19);
        expect(sum).toBeLessThanOrEqual(21);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('IN_PROGRESS ride without startedAt returns remainingMinutes: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: null,
            originalEtaMinutes: 10
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('originalEtaMinutes: 0 (unset) returns remainingMinutes: 0 immediately', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 0
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBe(0);
        await ride.deleteOne();
        await user.deleteOne();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.2.3 — Endpoint stable for 60-second polling (no-auth, correct format)
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.2.3 — Endpoint stable for 60s interval polling', () => {
    it('endpoint returns JSON content-type', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('no Authorization header required (unauthenticated request succeeds or 404)', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        // Should NOT return 401/403 — endpoint is accessible
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
    });

    it('two rapid calls return consistent remainingMinutes (within 1 min of each other)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 30
        });
        const rideId = ride._id.toString();
        const [r1, r2] = await Promise.all([
            request(app).get(BASE(rideId)),
            request(app).get(BASE(rideId))
        ]);
        expect(Math.abs(r1.body.remainingMinutes - r2.body.remainingMinutes)).toBeLessThanOrEqual(1);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('completed ride returns remainingMinutes: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'COMPLETED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('SEARCHING ride returns remainingMinutes: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'SEARCHING' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('CANCELED ride returns remainingMinutes: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'CANCELED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.remainingMinutes).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('response time is fast enough for polling (under 2000ms)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 15
        });
        const start = Date.now();
        await request(app).get(BASE(ride._id.toString()));
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('verify-otp endpoint sets startedAt on successful OTP verification', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'ARRIVED',
            otp: '7799',
            originalEtaMinutes: 12
        });
        const res = await request(app)
            .post(`/api/rides/${ride._id}/verify-otp`)
            .send({ otp: '7799' });
        expect(res.status).toBe(200);
        // After OTP verified, startedAt should be set on the ride
        const updated = await mongoose.model('Ride').findById(ride._id).lean();
        expect(updated.startedAt).not.toBeNull();
        expect(updated.status).toBe('IN_PROGRESS');
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
        await user.deleteOne();
    });
});
