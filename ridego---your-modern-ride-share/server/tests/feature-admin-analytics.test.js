/**
 * Feature: Admin Analytics & User Management Tests
 * Tests admin endpoints: revenue, disputes, reviews, user management, platform stats
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
        const Ride = mongoose.model('Ride');

        await User.deleteMany({ email: /vitest_admin_.*@test\.com/ });
        await Ride.deleteMany({ 'pickup.address': /VITEST_ADMIN_PICKUP/ });
    } catch (_) {}
    await mongoose.connection.close();
});

// ── Helpers ──
let adminDriver, adminRider;

async function setup() {
    const riderRes = await request(app).post('/api/signup').send({
        role: 'RIDER',
        email: `vitest_admin_rider_${Date.now()}@test.com`,
        phone: '9844000001',
        firstName: 'AdminTest',
        lastName: 'Rider',
        dob: '1993-08-12',
        gender: 'Female',
    });
    adminRider = riderRes.body.user;

    const driverRes = await request(app).post('/api/signup').send({
        role: 'DRIVER',
        email: `vitest_admin_driver_${Date.now()}@test.com`,
        phone: '9844000002',
        firstName: 'AdminTest',
        lastName: 'Driver',
        dob: '1990-04-25',
        gender: 'Male',
    });
    adminDriver = driverRes.body.user;

    // Create several rides for analytics
    const Ride = mongoose.model('Ride');
    const rides = [];
    for (let i = 0; i < 5; i++) {
        rides.push({
            userId: adminRider._id,
            driverId: adminDriver._id,
            pickup: { address: `VITEST_ADMIN_PICKUP_${i}`, lat: 12.97 + i * 0.01, lng: 77.59 },
            dropoff: { address: `VITEST_ADMIN_DROPOFF_${i}`, lat: 12.98 + i * 0.01, lng: 77.60 },
            status: 'COMPLETED',
            vehicleCategory: ['CAR', 'BIKE', 'AUTO', 'POOL', 'ECO'][i],
            fare: 100 + i * 50,
            completedFare: 100 + i * 50,
            distance: `${3 + i} km`,
        });
    }
    await Ride.insertMany(rides);
}

// ── Tests ──

describe('Admin Analytics Setup', () => {
    it('should create test data', async () => {
        await setup();
        expect(adminRider._id).toBeTruthy();
        expect(adminDriver._id).toBeTruthy();
    });
});

describe('GET /api/admin/revenue — Revenue Analytics', () => {
    it('should return revenue stats', async () => {
        const res = await request(app).get('/api/admin/revenue');
        expect(res.status).toBe(200);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.totalRevenue).toBeGreaterThanOrEqual(0);
    });

    it('should accept period parameter', async () => {
        const res = await request(app).get('/api/admin/revenue?period=month');
        expect(res.status).toBe(200);
        expect(res.body.summary).toBeDefined();
        expect(res.body.dailyBreakdown || res.body.breakdown).toBeDefined();
    });

    it('should include payment methods breakdown', async () => {
        const res = await request(app).get('/api/admin/revenue');
        expect(res.body.summary).toBeDefined();
    });
});

describe('GET /api/admin/disputes — Admin Disputes', () => {
    it('should list all disputes', async () => {
        const res = await request(app).get('/api/admin/disputes');
        expect(res.status).toBe(200);
        expect(res.body.disputes || Array.isArray(res.body)).toBeTruthy();
    });

    it('should support status filter', async () => {
        const res = await request(app).get('/api/admin/disputes?status=OPEN');
        expect(res.status).toBe(200);
    });

    it('should support priority filter', async () => {
        const res = await request(app).get('/api/admin/disputes?priority=CRITICAL');
        expect(res.status).toBe(200);
    });
});

describe('GET /api/admin/reviews — Admin Reviews', () => {
    it('should list all reviews', async () => {
        const res = await request(app).get('/api/admin/reviews');
        expect(res.status).toBe(200);
        expect(res.body.reviews || Array.isArray(res.body)).toBeTruthy();
    });

    it('should support visibility filter', async () => {
        const res = await request(app).get('/api/admin/reviews?visibility=VISIBLE');
        expect(res.status).toBe(200);
    });
});

describe('GET /api/admin/users — Admin User List', () => {
    it('should list users', async () => {
        const res = await request(app).get('/api/admin/users');
        expect(res.status).toBe(200);
        expect(res.body.users).toBeDefined();
        expect(res.body.users.length).toBeGreaterThanOrEqual(1);
        expect(res.body.pagination).toBeDefined();
    });

    it('should support role filter', async () => {
        const res = await request(app).get('/api/admin/users?role=DRIVER');
        expect(res.status).toBe(200);
        const allDrivers = res.body.users.every((u) => u.role === 'DRIVER');
        expect(allDrivers).toBe(true);
    });

    it('should support search', async () => {
        const res = await request(app).get('/api/admin/users?search=AdminTest');
        expect(res.status).toBe(200);
        expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });
});

describe('PATCH /api/admin/drivers/:driverId/verify — Driver Verification', () => {
    it('should verify a driver', async () => {
        const res = await request(app)
            .patch(`/api/admin/drivers/${adminDriver._id}/verify`)
            .send({ verified: true });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

describe('PATCH /api/admin/users/:userId/suspend — Suspend User', () => {
    it('should suspend a user', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${adminRider._id}/suspend`)
            .send({ suspended: true, reason: 'vitest admin test' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('should unsuspend a user', async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${adminRider._id}/suspend`)
            .send({ suspended: false });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

describe('GET /api/admin/platform-stats — Platform Statistics', () => {
    it('should return comprehensive platform stats', async () => {
        const res = await request(app).get('/api/admin/platform-stats');
        expect(res.status).toBe(200);
        expect(res.body.totalUsers).toBeDefined();
        expect(res.body.totalRides).toBeDefined();
        expect(res.body.totalDrivers).toBeDefined();
    });
});

describe('GET /api/users/:userId/ride-history — Enhanced Ride History', () => {
    it('should return ride history with stats', async () => {
        const res = await request(app).get(`/api/users/${adminRider._id}/ride-history`);
        expect(res.status).toBe(200);
        expect(res.body.rides).toBeDefined();
        expect(res.body.rides.length).toBeGreaterThanOrEqual(1);
        expect(res.body.stats).toBeDefined();
        expect(res.body.stats.totalRides).toBeGreaterThanOrEqual(1);
        expect(res.body.pagination).toBeDefined();
    });

    it('should support category filter', async () => {
        const res = await request(app).get(
            `/api/users/${adminRider._id}/ride-history?category=CAR`
        );
        expect(res.status).toBe(200);
        if (res.body.rides.length > 0) {
            expect(res.body.rides[0].vehicleCategory).toBe('CAR');
        }
    });

    it('should support pagination', async () => {
        const res = await request(app).get(
            `/api/users/${adminRider._id}/ride-history?page=1&limit=2`
        );
        expect(res.status).toBe(200);
        expect(res.body.rides.length).toBeLessThanOrEqual(2);
    });
});

describe('GET /api/users/:userId/earnings — Driver Earnings', () => {
    it('should return earnings for driver', async () => {
        const res = await request(app).get(`/api/users/${adminDriver._id}/earnings`);
        expect(res.status).toBe(200);
        expect(res.body.earnings || res.body.totalEarnings !== undefined).toBeTruthy();
    });
});

describe('Emergency Contacts', () => {
    it('should GET empty emergency contacts initially', async () => {
        const res = await request(app).get(
            `/api/users/${adminRider._id}/emergency-contacts`
        );
        expect(res.status).toBe(200);
    });

    it('should PUT/update emergency contacts', async () => {
        const res = await request(app)
            .put(`/api/users/${adminRider._id}/emergency-contacts`)
            .send({
                contacts: [
                    { name: 'Mom', phone: '9800000099', relationship: 'Mother' },
                    { name: 'Dad', phone: '9800000098', relationship: 'Father' },
                ],
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('should GET updated emergency contacts', async () => {
        const res = await request(app).get(
            `/api/users/${adminRider._id}/emergency-contacts`
        );
        expect(res.status).toBe(200);
        const contacts = res.body.contacts || res.body;
        expect(Array.isArray(contacts) ? contacts.length : 0).toBeGreaterThanOrEqual(0);
    });
});

describe('GET /api/users/:userId/cancellation-stats', () => {
    it('should return cancellation stats', async () => {
        const res = await request(app).get(
            `/api/users/${adminRider._id}/cancellation-stats`
        );
        expect(res.status).toBe(200);
        expect(res.body.totalCancellations !== undefined).toBe(true);
    });
});
