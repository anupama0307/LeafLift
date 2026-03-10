/**
 * Feature: Promo Code System Tests
 * Tests promo creation, application, usage limits, deactivation
 */

let app, request, mongoose;

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
        const User = mongoose.model('User');
        const Promo = mongoose.model('Promo');

        await User.deleteMany({ email: /vitest_promo_.*@test\.com/ });
        await Promo.deleteMany({ code: /^VITEST_/ });
    } catch (_) {}
    await mongoose.connection.close();
});

// ── Helpers ──
let testUser, createdPromoId;

async function setup() {
    const userRes = await request(app).post('/api/signup').send({
        role: 'RIDER',
        email: `vitest_promo_user_${Date.now()}@test.com`,
        phone: '9833000001',
        firstName: 'PromoTest',
        lastName: 'User',
        dob: '1997-05-10',
        gender: 'Male',
    });
    testUser = userRes.body.user;
}

// ── Tests ──

describe('Promo System Setup', () => {
    it('should create test user', async () => {
        await setup();
        expect(testUser._id).toBeTruthy();
    });
});

describe('POST /api/promos — Create Promo', () => {
    it('should create a percentage discount promo', async () => {
        const res = await request(app).post('/api/promos').send({
            code: `VITEST_SAVE20_${Date.now()}`,
            description: 'Test 20% off',
            discountType: 'PERCENTAGE',
            discountValue: 20,
            maxDiscount: 100,
            minRideAmount: 50,
            maxUsage: 100,
            perUserLimit: 3,
            applicableTo: 'ALL',
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000).toISOString(),
        });
        expect(res.status).toBe(201);
        expect(res.body.ok).toBe(true);
        expect(res.body.promo).toBeDefined();
        expect(res.body.promo.discountType).toBe('PERCENTAGE');
        createdPromoId = res.body.promo._id;
    });

    it('should create a flat discount promo', async () => {
        const res = await request(app).post('/api/promos').send({
            code: `VITEST_FLAT50_${Date.now()}`,
            description: 'Flat ₹50 off',
            discountType: 'FLAT',
            discountValue: 50,
            minRideAmount: 200,
            maxUsage: 50,
            perUserLimit: 1,
            applicableTo: 'POOL_ONLY',
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000).toISOString(),
        });
        expect(res.status).toBe(201);
        expect(res.body.promo.discountType).toBe('FLAT');
        expect(res.body.promo.applicableTo).toBe('POOL_ONLY');
    });

    it('should create a first-ride promo', async () => {
        const res = await request(app).post('/api/promos').send({
            code: `VITEST_FIRST_${Date.now()}`,
            description: 'First ride 50% off',
            discountType: 'PERCENTAGE',
            discountValue: 50,
            maxDiscount: 150,
            maxUsage: 1000,
            perUserLimit: 1,
            applicableTo: 'FIRST_RIDE',
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
        });
        expect(res.status).toBe(201);
        expect(res.body.promo.applicableTo).toBe('FIRST_RIDE');
    });

    it('should reject promo without code', async () => {
        const res = await request(app).post('/api/promos').send({
            description: 'Missing code',
            discountType: 'FLAT',
            discountValue: 10,
        });
        expect(res.status).toBe(400);
    });

    it('should reject promo with discount > 100 for PERCENTAGE', async () => {
        const res = await request(app).post('/api/promos').send({
            code: `VITEST_BAD_${Date.now()}`,
            discountType: 'PERCENTAGE',
            discountValue: 150,
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/promos/apply — Apply Promo Code', () => {
    let applyCode;

    it('should apply a valid promo and get discount', async () => {
        // Create a fresh promo for applying
        const createRes = await request(app).post('/api/promos').send({
            code: `VITEST_APPLY_${Date.now()}`,
            description: 'Apply test',
            discountType: 'PERCENTAGE',
            discountValue: 15,
            maxDiscount: 75,
            minRideAmount: 100,
            maxUsage: 10,
            perUserLimit: 2,
            applicableTo: 'ALL',
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 86400000).toISOString(),
        });
        applyCode = createRes.body.promo.code;

        const res = await request(app).post('/api/promos/apply').send({
            code: applyCode,
            userId: testUser._id,
            rideAmount: 500,
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.discount).toBeDefined();
        expect(res.body.discount).toBe(75); // 15% of 500 = 75, capped at maxDiscount 75
        expect(res.body.finalAmount).toBe(425);
    });

    it('should reject expired promo', async () => {
        const Promo = mongoose.model('Promo');
        const expiredPromo = new Promo({
            code: `VITEST_EXPIRED_${Date.now()}`,
            discountType: 'FLAT',
            discountValue: 20,
            validFrom: new Date(Date.now() - 86400000 * 2),
            validUntil: new Date(Date.now() - 86400000),
            isActive: true,
            maxUsage: 10,
        });
        await expiredPromo.save();

        const res = await request(app).post('/api/promos/apply').send({
            code: expiredPromo.code,
            userId: testUser._id,
            rideAmount: 100,
        });
        expect(res.status).toBe(400);
    });

    it('should reject promo below minimum ride amount', async () => {
        const res = await request(app).post('/api/promos/apply').send({
            code: applyCode,
            userId: testUser._id,
            rideAmount: 50, // minRideAmount is 100
        });
        expect(res.status).toBe(400);
    });

    it('should reject non-existent promo code', async () => {
        const res = await request(app).post('/api/promos/apply').send({
            code: 'VITEST_NONEXISTENT_CODE',
            userId: testUser._id,
            rideAmount: 500,
        });
        expect(res.status).toBe(404);
    });
});

describe('GET /api/promos — List Active Promos', () => {
    it('should list active promos', async () => {
        const res = await request(app).get('/api/promos');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
});

describe('PATCH /api/promos/:promoId/deactivate — Deactivate', () => {
    it('should deactivate a promo', async () => {
        const res = await request(app).patch(`/api/promos/${createdPromoId}/deactivate`);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.promo.isActive).toBe(false);
    });

    it('should return 404 for non-existent promo', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app).patch(`/api/promos/${fakeId}/deactivate`);
        expect(res.status).toBe(404);
    });
});
