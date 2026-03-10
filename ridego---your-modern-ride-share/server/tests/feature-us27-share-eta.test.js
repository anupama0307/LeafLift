/**
 * Tests for User Story 2.7 — Share ETA (Wall-Clock Arrival Time)
 *
 * 2.7.1  GET /api/rides/:rideId/arrival-eta returns a valid `estimatedArrivalTime`
 *        ISO string for IN_PROGRESS rides.
 * 2.7.2  The `estimatedArrivalTime` value is deterministic: it equals
 *        startedAt + originalEtaMinutes and is in the future for a fresh ride.
 * 2.7.3  Non-IN_PROGRESS rides return null for `estimatedArrivalTime`, and the
 *        endpoint is stable for repeated polling without auth.
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US27';

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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us27') });
    } catch (_) {}
    await mongoose.connection.close();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_us27_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9876543210',
        firstName: 'Share',
        lastName: 'ETA',
        dob: '1998-05-15',
        gender: 'Male',
        isVerified: false,
        ...o,
    }).save();
}

async function makeRide(userId, extra = {}) {
    return new (mongoose.model('Ride'))({
        userId,
        pickup:  { address: `${TEST_TAG} Pickup`,  lat: 11.0168, lng: 76.9558 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 90, currentFare: 90,
        vehicleCategory: 'CAR',
        status: 'SEARCHING',
        ...extra,
    }).save();
}

const BASE = (rideId) => `/api/rides/${rideId}/arrival-eta`;

// ══════════════════════════════════════════════════════════════════════════════
// US 2.7.1 — estimatedArrivalTime is a valid ISO string for IN_PROGRESS rides
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.7.1 — estimatedArrivalTime ISO string for IN_PROGRESS ride', () => {
    it('GET /api/rides/:rideId/arrival-eta returns 200 for IN_PROGRESS ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 15,
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('response contains estimatedArrivalTime field', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 20,
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body).toHaveProperty('estimatedArrivalTime');
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime is a non-null string for a fresh IN_PROGRESS ride', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 18,
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.body.estimatedArrivalTime).not.toBeNull();
        expect(typeof res.body.estimatedArrivalTime).toBe('string');
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime is a valid parseable ISO date string', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 12,
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        const parsed = new Date(res.body.estimatedArrivalTime);
        expect(Number.isNaN(parsed.getTime())).toBe(false);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('returns 404 with message for unknown ride ID', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res    = await request(app).get(BASE(fakeId));
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('message');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.7.2 — estimatedArrivalTime = startedAt + originalEtaMinutes (deterministic)
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.7.2 — estimatedArrivalTime is correct and in the future for fresh rides', () => {
    it('estimatedArrivalTime is in the future for a ride just started', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 15,
        });
        const res     = await request(app).get(BASE(ride._id.toString()));
        const arrival = new Date(res.body.estimatedArrivalTime).getTime();
        expect(arrival).toBeGreaterThan(Date.now());
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime = startedAt + originalEtaMinutes (within 10 s tolerance)', async () => {
        const user          = await makeUser();
        const startedAt     = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
        const etaMin        = 20;
        const ride          = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt,
            originalEtaMinutes: etaMin,
        });
        const res      = await request(app).get(BASE(ride._id.toString()));
        const expected = new Date(startedAt.getTime() + etaMin * 60_000).getTime();
        const actual   = new Date(res.body.estimatedArrivalTime).getTime();
        expect(Math.abs(actual - expected)).toBeLessThan(10_000); // ≤ 10 s
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime matches different ETA values precisely', async () => {
        for (const etaMin of [5, 10, 30, 60]) {
            const user      = await makeUser();
            const startedAt = new Date();
            const ride      = await makeRide(user._id, {
                status: 'IN_PROGRESS',
                startedAt,
                originalEtaMinutes: etaMin,
            });
            const res      = await request(app).get(BASE(ride._id.toString()));
            const expected = new Date(startedAt.getTime() + etaMin * 60_000).getTime();
            const actual   = new Date(res.body.estimatedArrivalTime).getTime();
            expect(Math.abs(actual - expected)).toBeLessThan(10_000);
            await ride.deleteOne();
            await user.deleteOne();
        }
    });

    it('two rapid calls return the same estimatedArrivalTime (within 5 s)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 25,
        });
        const rideId = ride._id.toString();
        const [r1, r2] = await Promise.all([
            request(app).get(BASE(rideId)),
            request(app).get(BASE(rideId)),
        ]);
        const t1 = new Date(r1.body.estimatedArrivalTime).getTime();
        const t2 = new Date(r2.body.estimatedArrivalTime).getTime();
        expect(Math.abs(t1 - t2)).toBeLessThan(5_000);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('estimatedArrivalTime is in the past for an overdue ride (started 30 min ago, ETA=10)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(Date.now() - 30 * 60_000), // started 30 min ago
            originalEtaMinutes: 10,
        });
        const res     = await request(app).get(BASE(ride._id.toString()));
        const arrival = new Date(res.body.estimatedArrivalTime).getTime();
        // Arrival = startedAt + 10min = 20 min ago → in the past
        expect(arrival).toBeLessThan(Date.now());
        await ride.deleteOne();
        await user.deleteOne();
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.7.3 — Non-IN_PROGRESS rides return null; endpoint stable without auth
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.7.3 — Non-IN_PROGRESS rides return null; stable polling without auth', () => {
    it('ACCEPTED ride returns estimatedArrivalTime: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'ACCEPTED' });
        const res  = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.estimatedArrivalTime).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('COMPLETED ride returns estimatedArrivalTime: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'COMPLETED' });
        const res  = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.estimatedArrivalTime).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('CANCELED ride returns estimatedArrivalTime: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'CANCELED' });
        const res  = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.estimatedArrivalTime).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('SEARCHING ride returns estimatedArrivalTime: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, { status: 'SEARCHING' });
        const res  = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.estimatedArrivalTime).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('endpoint accessible without Authorization header (no 401/403)', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            originalEtaMinutes: 10,
        });
        const res = await request(app)
            .get(BASE(ride._id.toString()));
            // intentionally no .set('Authorization', ...)
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
        await ride.deleteOne();
        await user.deleteOne();
    });

    it('response is JSON content-type for any rideId', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res    = await request(app).get(BASE(fakeId));
        expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('IN_PROGRESS ride without startedAt returns estimatedArrivalTime: null', async () => {
        const user = await makeUser();
        const ride = await makeRide(user._id, {
            status: 'IN_PROGRESS',
            startedAt: null,
            originalEtaMinutes: 15,
        });
        const res = await request(app).get(BASE(ride._id.toString()));
        expect(res.status).toBe(200);
        expect(res.body.estimatedArrivalTime).toBeNull();
        await ride.deleteOne();
        await user.deleteOne();
    });
});
