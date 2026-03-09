/**
 * Tests for User Story 3.6 — Rider CO₂ Savings Banner & Green Tier Badge
 *
 * 3.6.1  After ride completion, rideSummary carries co2SavedG / co2SavedKg for banner.
 * 3.6.2  GET /api/users/:userId/eco-tier returns cumulative CO₂ saved.
 * 3.6.3  Correct tier badge (Seedling / Sapling / Tree) assigned by threshold.
 */

let app, request, mongoose;
const TEST_TAG = 'Vitest_US36';

// ── helpers ────────────────────────────────────────────────────────────────────
async function makeUser({ savedG = 0, emittedG = 0, trips = 0, kmTraveled = 0 } = {}) {
    return new (mongoose.model('User'))({
        role:            'RIDER',
        email:           `vitest_us36_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone:           '9900000036',
        firstName:       'Eco',
        lastName:        'Tester',
        dob:             '1998-01-10',
        gender:          'Male',
        isVerified:      true,
        totalCO2Saved:   savedG,
        totalCO2Emitted: emittedG,
        totalTrips:      trips,
        totalKmTraveled: kmTraveled,
    }).save();
}

async function makeCompletedRide(userId, co2Emissions, co2Saved, isPooled = false) {
    return new (mongoose.model('Ride'))({
        userId,
        pickup:          { address: `${TEST_TAG} Origin`, lat: 9.9312, lng: 76.2673 },
        dropoff:         { address: `${TEST_TAG} Dest`,   lat: 9.5916, lng: 76.5222 },
        status:          'COMPLETED',
        isPooled,
        fare:            120,
        currentFare:     120,
        vehicleCategory: 'CAR',
        co2Emissions,
        co2Saved,
        createdAt:       new Date(),
        bookingTime:     new Date(),
    }).save();
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────
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
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us36') });
    } catch (_) {}
});

// ══════════════════════════════════════════════════════════════════════════════
// US 3.6.1 — Ride completion carries co2Saved data for the banner
// ══════════════════════════════════════════════════════════════════════════════
describe('US 3.6.1 — Completed ride carries co2SavedG for summary banner', () => {
    let userId;

    beforeAll(async () => {
        const rider = await makeUser();
        userId = rider._id.toString();
    });

    it('pooled ride stored in DB has non-negative co2Saved', async () => {
        const ride = await makeCompletedRide(userId, 500, 500, true);
        expect(ride.co2Saved).toBeGreaterThanOrEqual(0);
        expect(ride.isPooled).toBe(true);
    });

    it('non-pooled ride stored in DB has co2Saved = 0', async () => {
        const ride = await makeCompletedRide(userId, 800, 0, false);
        expect(ride.co2Saved).toBe(0);
    });

    it('/api/rides/:rideId/carbon returns co2SavedG and co2SavedKg fields', async () => {
        const ride = await makeCompletedRide(userId, 600, 300, true);
        const res  = await request(app).get(`/api/rides/${ride._id}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('co2SavedG');
        expect(res.body).toHaveProperty('co2SavedKg');
        expect(typeof res.body.co2SavedG).toBe('number');
        expect(res.body.co2SavedG).toBeGreaterThanOrEqual(0);
    });

    it('co2SavedKg equals co2SavedG / 1000', async () => {
        const ride = await makeCompletedRide(userId, 800, 400, true);
        const res  = await request(app).get(`/api/rides/${ride._id}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body.co2SavedKg).toBeCloseTo(res.body.co2SavedG / 1000, 2);
    });

    it('non-pooled ride co2SavedG reported as 0 from /carbon endpoint', async () => {
        const ride = await makeCompletedRide(userId, 1000, 0, false);
        const res  = await request(app).get(`/api/rides/${ride._id}/carbon`);
        expect(res.status).toBe(200);
        expect(res.body.co2SavedG).toBe(0);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 3.6.2 — GET /api/users/:userId/eco-tier cumulative data
// ══════════════════════════════════════════════════════════════════════════════
describe('US 3.6.2 — eco-tier endpoint returns cumulative CO₂ saved', () => {
    it('returns 200 with totalCO2SavedG and totalCO2SavedKg', async () => {
        const user = await makeUser({ savedG: 2000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.totalCO2SavedG).toBe(2000);
        expect(res.body.totalCO2SavedKg).toBeCloseTo(2.0, 2);
    });

    it('returns correct treeEquivalent (21 000 g = 1 tree-year)', async () => {
        const user = await makeUser({ savedG: 21000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.treeEquivalent).toBeCloseTo(1.0, 3);
    });

    it('returns totalCO2EmittedKg correctly', async () => {
        const user = await makeUser({ emittedG: 5000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.totalCO2EmittedKg).toBeCloseTo(5.0, 2);
    });

    it('returns totalTrips correctly', async () => {
        const user = await makeUser({ savedG: 300, trips: 7 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.totalTrips).toBe(7);
    });

    it('returns 404 for a non-existent userId', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res    = await request(app).get(`/api/users/${fakeId}/eco-tier`);
        expect(res.status).toBe(404);
    });

    it('returns zeros for a brand-new user with no rides', async () => {
        const user = await makeUser();
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.totalCO2SavedG).toBe(0);
        expect(res.body.totalCO2SavedKg).toBe(0);
        expect(res.body.totalTrips).toBe(0);
    });

    it('returns thresholds object with SAPLING and TREE keys', async () => {
        const user = await makeUser();
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.thresholds).toBeDefined();
        expect(res.body.thresholds).toHaveProperty('SAPLING');
        expect(res.body.thresholds).toHaveProperty('TREE');
    });

    it('returns progressPct in range [0, 100]', async () => {
        const user = await makeUser({ savedG: 1500 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.progressPct).toBeGreaterThanOrEqual(0);
        expect(res.body.progressPct).toBeLessThanOrEqual(100);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// US 3.6.3 — Tier badge assignment by threshold
// ══════════════════════════════════════════════════════════════════════════════
describe('US 3.6.3 — eco-tier badge assigned by threshold', () => {
    it('Seedling when totalCO2Saved = 0 g', async () => {
        const user = await makeUser({ savedG: 0 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('seedling');
        expect(res.body.tierLabel).toBe('Seedling');
    });

    it('Seedling when totalCO2Saved = 499 g (just below Sapling threshold)', async () => {
        const user = await makeUser({ savedG: 499 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('seedling');
    });

    it('Sapling when totalCO2Saved = 500 g (exactly at threshold)', async () => {
        const user = await makeUser({ savedG: 500 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('sapling');
        expect(res.body.tierLabel).toBe('Sapling');
    });

    it('Sapling when totalCO2Saved = 2500 g (mid-range)', async () => {
        const user = await makeUser({ savedG: 2500 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('sapling');
    });

    it('Sapling when totalCO2Saved = 4999 g (just below Tree threshold)', async () => {
        const user = await makeUser({ savedG: 4999 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('sapling');
    });

    it('Tree when totalCO2Saved = 5000 g (exactly at threshold)', async () => {
        const user = await makeUser({ savedG: 5000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('tree');
        expect(res.body.tierLabel).toBe('Tree');
    });

    it('Tree when totalCO2Saved = 50 000 g (well above threshold)', async () => {
        const user = await makeUser({ savedG: 50000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('tree');
    });

    it('progressPct = 100 for Tree tier', async () => {
        const user = await makeUser({ savedG: 5000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.progressPct).toBe(100);
    });

    it('progressPct = 0 for brand-new user (0 g saved)', async () => {
        const user = await makeUser({ savedG: 0 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.progressPct).toBe(0);
    });

    it('progressPct = 50 for Seedling at 250 g (50% of 500 g threshold)', async () => {
        const user = await makeUser({ savedG: 250 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.tier).toBe('seedling');
        expect(res.body.progressPct).toBe(50);
    });

    it('nextTier = null for Tree (already at top)', async () => {
        const user = await makeUser({ savedG: 10000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.nextTier).toBeNull();
    });

    it('nextTier = "tree" for Sapling', async () => {
        const user = await makeUser({ savedG: 1000 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.nextTier).toBe('tree');
    });

    it('nextTier = "sapling" for Seedling', async () => {
        const user = await makeUser({ savedG: 100 });
        const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
        expect(res.status).toBe(200);
        expect(res.body.nextTier).toBe('sapling');
    });

    it('tierEmoji is a non-empty string for all tiers', async () => {
        for (const savedG of [0, 500, 5000]) {
            const user = await makeUser({ savedG });
            const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
            expect(res.status).toBe(200);
            expect(typeof res.body.tierEmoji).toBe('string');
            expect(res.body.tierEmoji.length).toBeGreaterThan(0);
        }
    });

    it('tierDescription is a non-empty string for all tiers', async () => {
        for (const savedG of [0, 750, 8000]) {
            const user = await makeUser({ savedG });
            const res  = await request(app).get(`/api/users/${user._id}/eco-tier`);
            expect(res.status).toBe(200);
            expect(typeof res.body.tierDescription).toBe('string');
            expect(res.body.tierDescription.length).toBeGreaterThan(0);
        }
    });
});
