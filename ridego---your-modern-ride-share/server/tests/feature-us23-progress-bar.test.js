/**
 * Tests for User Story 2.3 — Visual Progress Bar on Active Ride Screen
 *
 * 2.3.1  Progress bar present — endpoint returns progressPercent field.
 * 2.3.2  progressPercent = min(100, round(elapsed / originalEta * 100)).
 * 2.3.3  Endpoint stable for 60-second refresh polling (no auth, fast, consistent).
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US23';

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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us23') });
    } catch (_) {}
    await mongoose.connection.close();
});

// ─── helpers ───────────────────────────────────────────────────────────────
async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_us23_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9876001234',
        firstName: 'Progress', lastName: 'Tester',
        dob: '1997-03-10', gender: 'Female', isVerified: false,
        ...o
    }).save();
}

async function makeRide(userId, extra = {}) {
    return new (mongoose.model('Ride'))({
        userId,
        pickup: { address: `${TEST_TAG} Pickup`, lat: 11.0168, lng: 76.9558 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 100, currentFare: 100,
        vehicleCategory: 'AUTO',
        status: 'SEARCHING',
        ...extra
    }).save();
}

const BASE = (id) => `/api/rides/${id}/trip-progress`;

// ══════════════════════════════════════════════════════════════════════════════
// US 2.3.1 — Progress bar present (response shape & field availability)
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.3.1 — Progress bar present on active ride (response shape)', () => {
    it('GET /api/rides/:rideId/trip-progress returns 404 for unknown ride', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.status).toBe(404);
    });

    it('404 response has message field', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.body).toHaveProperty('message');
    });

    it('returns 200 for non-IN_PROGRESS ride (ACCEPTED)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ACCEPTED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('non-IN_PROGRESS response has progressPercent: 0', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ARRIVED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('non-IN_PROGRESS response includes status field', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ACCEPTED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body).toHaveProperty('status', 'ACCEPTED');
        await ride.deleteOne(); await user.deleteOne();
    });

    it('IN_PROGRESS ride response contains all required fields', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('progressPercent');
        expect(res.body).toHaveProperty('elapsedMinutes');
        expect(res.body).toHaveProperty('originalEtaMinutes');
        expect(res.body).toHaveProperty('startedAt');
        expect(res.body).toHaveProperty('status', 'IN_PROGRESS');
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent is a number between 0 and 100 inclusive', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 15
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(typeof res.body.progressPercent).toBe('number');
        expect(res.body.progressPercent).toBeGreaterThanOrEqual(0);
        expect(res.body.progressPercent).toBeLessThanOrEqual(100);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('elapsedMinutes is non-negative for a freshly started ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 12
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.elapsedMinutes).toBeGreaterThanOrEqual(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('originalEtaMinutes in response matches what was set on the ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 22
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.originalEtaMinutes).toBe(22);
        await ride.deleteOne(); await user.deleteOne();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.3.2 — Progress % = min(100, round(elapsed / originalEta * 100))
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.3.2 — Progress percentage calculation', () => {
    it('progressPercent ≈ 0% for a ride started seconds ago', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 30
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBeGreaterThanOrEqual(0);
        expect(res.body.progressPercent).toBeLessThanOrEqual(5);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent ≈ 50% for a ride half-way through', async () => {
        const user = await makeUser();
        const halfwayAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 of 20 min elapsed
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: halfwayAgo,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBeGreaterThanOrEqual(48);
        expect(res.body.progressPercent).toBeLessThanOrEqual(52);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent = 100 when elapsed ≥ originalEtaMinutes', async () => {
        const user = await makeUser();
        const overdueStart = new Date(Date.now() - 40 * 60 * 1000); // 40 min ago, eta was 20
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: overdueStart,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(100);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent never exceeds 100', async () => {
        const user = await makeUser();
        const veryOldStart = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: veryOldStart,
            originalEtaMinutes: 15
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(100);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent ≈ 75% for a ride 75% complete', async () => {
        const user = await makeUser();
        const threeQuartersAgo = new Date(Date.now() - 15 * 60 * 1000); // 15 of 20 min
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: threeQuartersAgo,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBeGreaterThanOrEqual(73);
        expect(res.body.progressPercent).toBeLessThanOrEqual(77);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent = 0 when startedAt is null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: null,
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent = 0 when originalEtaMinutes is 0', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 0
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('elapsedMinutes ≈ 5 for a ride started 5 minutes ago', async () => {
        const user = await makeUser();
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: fiveMinAgo,
            originalEtaMinutes: 25
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.elapsedMinutes).toBeGreaterThanOrEqual(5);
        expect(res.body.elapsedMinutes).toBeLessThanOrEqual(6);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('progressPercent integer (no decimal fractions)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 7 * 60 * 1000),
            originalEtaMinutes: 20
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(Number.isInteger(res.body.progressPercent)).toBe(true);
        await ride.deleteOne(); await user.deleteOne();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.3.3 — Endpoint stable for 60-second polling
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.3.3 — Endpoint stable for 60s refresh polling', () => {
    it('returns JSON content-type', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('no Authorization required (no 401 or 403)', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app).get(BASE(fakeId));
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
    });

    it('two rapid consecutive calls return same progressPercent (within 1%)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 8 * 60 * 1000),
            originalEtaMinutes: 20
        });
        const rideId = ride._id.toString();
        const [r1, r2] = await Promise.all([
            request(app).get(BASE(rideId)),
            request(app).get(BASE(rideId))
        ]);
        expect(Math.abs(r1.body.progressPercent - r2.body.progressPercent)).toBeLessThanOrEqual(1);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('COMPLETED ride returns progressPercent: 0 (not in progress)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'COMPLETED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.progressPercent).toBe(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('CANCELED ride returns progressPercent: 0', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'CANCELED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('SEARCHING ride returns progressPercent: 0', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'SEARCHING' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.progressPercent).toBe(0);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('response time under 2000ms (suitable for polling)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 18
        });
        const t0 = Date.now();
        await request(app).get(BASE(ride._id.toString()));
        expect(Date.now() - t0).toBeLessThan(2000);
        await ride.deleteOne(); await user.deleteOne();
    });

    it('elapsedMinutes is null for non-IN_PROGRESS ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ARRIVED' });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.elapsedMinutes).toBeNull();
        await ride.deleteOne(); await user.deleteOne();
    });
});
