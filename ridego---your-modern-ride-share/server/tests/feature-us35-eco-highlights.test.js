/**
 * Tests for User Story 3.5 — Eco-friendly ride highlighting
 * 3.5.1 Design a green badge for eco-friendly ride options
 * 3.5.2 Logic to flag vehicles with low emission ratings
 * 3.5.3 Show green highlights clearly on the ride list
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

// ── 3.5.1 — Green Badge Design ───────────────────────────────────────────────
describe('US 3.5.1 — Green Badge Design', () => {
    it('GET /api/vehicles/eco-ratings returns 200', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        expect(res.status).toBe(200);
    });

    it('response contains vehicles array and thresholds object', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        expect(Array.isArray(res.body.vehicles)).toBe(true);
        expect(res.body.thresholds).toBeDefined();
        expect(res.body.thresholds).toHaveProperty('ECO_STAR');
        expect(res.body.thresholds).toHaveProperty('ECO_FRIENDLY');
    });

    it('BIKE has badgeLabel "Eco Star"', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const bike = res.body.vehicles.find(v => v.id === 'BIKE');
        expect(bike).toBeDefined();
        expect(bike.badgeLabel).toBe('Eco Star');
    });

    it('AUTO has badgeLabel "Eco Friendly"', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const auto = res.body.vehicles.find(v => v.id === 'AUTO');
        expect(auto.badgeLabel).toBe('Eco Friendly');
    });

    it('CAR has no solo badgeLabel (null)', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const car = res.body.vehicles.find(v => v.id === 'CAR');
        expect(car.badgeLabel).toBeNull();
    });

    it('BIG_CAR has no solo badgeLabel (null)', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const suv = res.body.vehicles.find(v => v.id === 'BIG_CAR');
        expect(suv.badgeLabel).toBeNull();
    });

    it('CAR in pool mode has poolBadgeLabel "Pool Eco"', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const car = res.body.vehicles.find(v => v.id === 'CAR');
        expect(car.poolBadgeLabel).toBe('Pool Eco');
    });

    it('BIG_CAR in pool mode has poolBadgeLabel "Pool Eco"', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const suv = res.body.vehicles.find(v => v.id === 'BIG_CAR');
        expect(suv.poolBadgeLabel).toBe('Pool Eco');
    });
});

// ── 3.5.2 — Eco Flagging Logic ────────────────────────────────────────────────
describe('US 3.5.2 — Vehicle Eco Flagging Logic', () => {
    it('thresholds: ECO_STAR <= 25, ECO_FRIENDLY <= 80', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        expect(res.body.thresholds.ECO_STAR).toBe(25);
        expect(res.body.thresholds.ECO_FRIENDLY).toBe(80);
    });

    it('BIKE (21 g/km) is flagged isEco=true with ecoTier "eco_star"', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const bike = res.body.vehicles.find(v => v.id === 'BIKE');
        expect(bike.isEco).toBe(true);
        expect(bike.ecoTier).toBe('eco_star');
    });

    it('AUTO (65 g/km) is flagged isEco=true with ecoTier "eco_friendly"', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const auto = res.body.vehicles.find(v => v.id === 'AUTO');
        expect(auto.isEco).toBe(true);
        expect(auto.ecoTier).toBe('eco_friendly');
    });

    it('CAR (120 g/km) is flagged isEco=false, ecoTier null', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const car = res.body.vehicles.find(v => v.id === 'CAR');
        expect(car.isEco).toBe(false);
        expect(car.ecoTier).toBeNull();
    });

    it('BIG_CAR (170 g/km) is flagged isEco=false, ecoTier null', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const suv = res.body.vehicles.find(v => v.id === 'BIG_CAR');
        expect(suv.isEco).toBe(false);
        expect(suv.ecoTier).toBeNull();
    });

    it('CAR pool rate (40 g/km) is flagged isPoolEco=true', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const car = res.body.vehicles.find(v => v.id === 'CAR');
        expect(car.isPoolEco).toBe(true);
        expect(car.poolEmissionRateGPerKm).toBe(40);
    });

    it('BIKE has no pool rate (null)', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const bike = res.body.vehicles.find(v => v.id === 'BIKE');
        expect(bike.poolEmissionRateGPerKm).toBeNull();
    });

    it('emission rates match server CO2_RATES_G_PER_KM constants', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const map = Object.fromEntries(res.body.vehicles.map(v => [v.id, v.emissionRateGPerKm]));
        expect(map['BIKE']).toBe(21);
        expect(map['AUTO']).toBe(65);
        expect(map['CAR']).toBe(120);
        expect(map['BIG_CAR']).toBe(170);
    });
});

// ── 3.5.3 — Ride List Highlighting Data ──────────────────────────────────────
describe('US 3.5.3 — Eco Highlights on Ride List', () => {
    it('exactly 2 solo-eco vehicles (BIKE + AUTO)', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const ecoCount = res.body.vehicles.filter(v => v.isEco).length;
        expect(ecoCount).toBe(2);
    });

    it('exactly 2 pool-eco vehicles (CAR + BIG_CAR)', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const poolEcoCount = res.body.vehicles.filter(v => v.isPoolEco).length;
        expect(poolEcoCount).toBe(2);
    });

    it('all vehicles expose emissionRateGPerKm for frontend display', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        for (const v of res.body.vehicles) {
            expect(typeof v.emissionRateGPerKm).toBe('number');
            expect(v.emissionRateGPerKm).toBeGreaterThan(0);
        }
    });

    it('all vehicles expose id, label, icon for UI card rendering', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        for (const v of res.body.vehicles) {
            expect(v.id).toBeDefined();
            expect(v.label).toBeDefined();
            expect(v.icon).toBeDefined();
        }
    });

    it('eco vehicles have lower emission rates than non-eco vehicles', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const ecoRates    = res.body.vehicles.filter(v => v.isEco).map(v => v.emissionRateGPerKm);
        const nonEcoRates = res.body.vehicles.filter(v => !v.isEco).map(v => v.emissionRateGPerKm);
        const maxEco    = Math.max(...ecoRates);
        const minNonEco = Math.min(...nonEcoRates);
        expect(maxEco).toBeLessThan(minNonEco);
    });

    it('BIKE has the lowest emission rate across all vehicles', async () => {
        const res = await request(app).get('/api/vehicles/eco-ratings');
        const rates = res.body.vehicles.map(v => v.emissionRateGPerKm);
        const bikeRate = res.body.vehicles.find(v => v.id === 'BIKE').emissionRateGPerKm;
        expect(bikeRate).toBe(Math.min(...rates));
    });
});
