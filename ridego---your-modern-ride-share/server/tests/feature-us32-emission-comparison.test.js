/**
 * Tests for User Story 3.2 — Compare Solo and Pooled Ride Emissions
 * Endpoint: GET /api/emission-compare?distKm=X&vehicleCategory=Y
 *
 * CO₂ rates used by backend (g/km):
 *   BIKE: 21 | AUTO: 65 | CAR: 120 | BIG_CAR: 170 | POOL: 40
 */
let app, request;

beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;
    const server = await import('../index.js');
    app = server.app;
});

/* ─────────────────── US 3.2.1 — Side-by-side emission metrics ─────────────────── */
describe('US 3.2.1 — API returns solo and pool emission metrics', () => {
    it('returns 200 with required top-level shape', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('distKm');
        expect(res.body).toHaveProperty('vehicleCategory');
        expect(res.body).toHaveProperty('solo');
        expect(res.body).toHaveProperty('pool');
        expect(res.body).toHaveProperty('comparison');
    });

    it('solo object contains all required fields', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { solo } = res.body;
        expect(solo).toHaveProperty('co2EmittedG');
        expect(solo).toHaveProperty('co2EmittedKg');
        expect(solo).toHaveProperty('emissionRateGPerKm');
        expect(typeof solo.co2EmittedG).toBe('number');
        expect(typeof solo.co2EmittedKg).toBe('number');
    });

    it('pool object contains all required fields', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { pool } = res.body;
        expect(pool).toHaveProperty('co2EmittedG');
        expect(pool).toHaveProperty('co2EmittedKg');
        expect(pool).toHaveProperty('emissionRateGPerKm');
        expect(pool.emissionRateGPerKm).toBe(40); // fixed pool rate
    });

    it('comparison object contains all required fields', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { comparison } = res.body;
        expect(comparison).toHaveProperty('co2SavedG');
        expect(comparison).toHaveProperty('co2SavedKg');
        expect(comparison).toHaveProperty('reductionPct');
        expect(comparison).toHaveProperty('treeEquivalent');
        expect(comparison).toHaveProperty('poolBarPct');
    });

    it('solo emits more CO₂ than pool for CAR', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        expect(res.body.solo.co2EmittedG).toBeGreaterThan(res.body.pool.co2EmittedG);
    });

    it('solo emits more CO₂ than pool for BIG_CAR', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=15&vehicleCategory=BIG_CAR');
        expect(res.body.solo.co2EmittedG).toBeGreaterThan(res.body.pool.co2EmittedG);
    });

    it('returns 400 when distKm is missing', async () => {
        const res = await request(app).get('/api/emission-compare?vehicleCategory=CAR');
        expect(res.status).toBe(400);
    });

    it('returns 400 when distKm is zero', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=0&vehicleCategory=CAR');
        expect(res.status).toBe(400);
    });

    it('returns 400 for invalid vehicleCategory', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=TRUCK');
        expect(res.status).toBe(400);
    });

    it('defaults vehicleCategory to CAR when not provided', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10');
        expect(res.status).toBe(200);
        expect(res.body.vehicleCategory).toBe('CAR');
    });
});

/* ─────────────────── US 3.2.2 — Carbon output difference calculation ─────────────────── */
describe('US 3.2.2 — Carbon output difference calculation', () => {
    it('10km CAR: solo = 1200g (120 g/km)', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        expect(res.body.solo.co2EmittedG).toBe(1200);
        expect(res.body.solo.emissionRateGPerKm).toBe(120);
    });

    it('10km BIG_CAR: solo = 1700g (170 g/km)', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=BIG_CAR');
        expect(res.body.solo.co2EmittedG).toBe(1700);
        expect(res.body.solo.emissionRateGPerKm).toBe(170);
    });

    it('10km pool always = 400g (40 g/km) regardless of vehicle', async () => {
        const resCar = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const resBig = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=BIG_CAR');
        expect(resCar.body.pool.co2EmittedG).toBe(400);
        expect(resBig.body.pool.co2EmittedG).toBe(400);
    });

    it('comparison.co2SavedG = solo.co2EmittedG - pool.co2EmittedG', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { solo, pool, comparison } = res.body;
        expect(comparison.co2SavedG).toBe(solo.co2EmittedG - pool.co2EmittedG);
    });

    it('10km CAR: reductionPct ≈ 67% (800/1200)', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        expect(res.body.comparison.reductionPct).toBe(67);
    });

    it('comparison.co2SavedKg = co2SavedG / 1000 (string-level precision)', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { comparison } = res.body;
        expect(comparison.co2SavedKg).toBeCloseTo(comparison.co2SavedG / 1000, 2);
    });

    it('co2 emissions scale linearly with distance', async () => {
        const r5 = (await request(app).get('/api/emission-compare?distKm=5&vehicleCategory=CAR')).body;
        const r10 = (await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR')).body;
        expect(r10.solo.co2EmittedG).toBe(r5.solo.co2EmittedG * 2);
        expect(r10.pool.co2EmittedG).toBe(r5.pool.co2EmittedG * 2);
    });

    it('BIG_CAR has higher solo emissions than CAR for same distance', async () => {
        const resCar = (await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR')).body;
        const resBig = (await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=BIG_CAR')).body;
        expect(resBig.solo.co2EmittedG).toBeGreaterThan(resCar.solo.co2EmittedG);
    });
});

/* ─────────────────── US 3.2.3 — Visualize environmental savings ─────────────────── */
describe('US 3.2.3 — Environmental savings visualization data', () => {
    it('treeEquivalent = co2SavedG / 21000 (to 4dp)', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { comparison } = res.body;
        const expected = parseFloat((comparison.co2SavedG / 21000).toFixed(4));
        expect(comparison.treeEquivalent).toBe(expected);
    });

    it('poolBarPct reflects pool/solo ratio as integer percentage', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { solo, pool, comparison } = res.body;
        const expected = Math.round((pool.co2EmittedG / solo.co2EmittedG) * 100);
        expect(comparison.poolBarPct).toBe(expected);
    });

    it('10km CAR: poolBarPct = 33 (400/1200 * 100)', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        expect(res.body.comparison.poolBarPct).toBe(33);
    });

    it('reductionPct + poolBarPct ≈ 100 for CAR', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=CAR');
        const { reductionPct, poolBarPct } = res.body.comparison;
        // reductionPct = 67, poolBarPct = 33 → sum = 100
        expect(reductionPct + poolBarPct).toBe(100);
    });

    it('larger distance still gives same reductionPct for same category', async () => {
        const r1 = (await request(app).get('/api/emission-compare?distKm=5&vehicleCategory=CAR')).body;
        const r2 = (await request(app).get('/api/emission-compare?distKm=50&vehicleCategory=CAR')).body;
        expect(r1.comparison.reductionPct).toBe(r2.comparison.reductionPct);
    });

    it('echo field: distKm in response matches request input', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=12.5&vehicleCategory=CAR');
        expect(res.status).toBe(200);
        expect(res.body.distKm).toBe(12.5);
    });

    it('echo field: vehicleCategory in response is uppercased', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=car');
        expect(res.status).toBe(200);
        expect(res.body.vehicleCategory).toBe('CAR');
    });

    it('solo.co2EmittedKg matches solo.co2EmittedG / 1000 to 3dp', async () => {
        const res = await request(app).get('/api/emission-compare?distKm=10&vehicleCategory=BIG_CAR');
        const { solo } = res.body;
        expect(solo.co2EmittedKg).toBeCloseTo(solo.co2EmittedG / 1000, 3);
    });
});
