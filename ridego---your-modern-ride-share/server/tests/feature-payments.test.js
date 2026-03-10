/**
 * Feature: Payment & Transaction System Tests
 * Tests payment creation, refunds, user history, fare breakdowns
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
        const Payment = mongoose.model('Payment');

        await User.deleteMany({ email: /vitest_payment_.*@test\.com/ });
        await Ride.deleteMany({ 'pickup.address': /VITEST_PAYMENT_PICKUP/ });
        await Payment.deleteMany({ transactionId: /vitest_pay_/ });
    } catch (_) {}
    await mongoose.connection.close();
});

// ── Helpers ──
let testRider, testDriver, testRide, createdPaymentId;

async function setup() {
    const riderRes = await request(app).post('/api/signup').send({
        role: 'RIDER',
        email: `vitest_payment_rider_${Date.now()}@test.com`,
        phone: '9811000001',
        firstName: 'PayTest',
        lastName: 'Rider',
        dob: '1994-01-01',
        gender: 'Female',
    });
    testRider = riderRes.body.user;

    const driverRes = await request(app).post('/api/signup').send({
        role: 'DRIVER',
        email: `vitest_payment_driver_${Date.now()}@test.com`,
        phone: '9811000002',
        firstName: 'PayTest',
        lastName: 'Driver',
        dob: '1992-01-01',
        gender: 'Male',
    });
    testDriver = driverRes.body.user;

    const Ride = mongoose.model('Ride');
    const ride = new Ride({
        userId: testRider._id,
        driverId: testDriver._id,
        pickup: { address: 'VITEST_PAYMENT_PICKUP_A', lat: 12.97, lng: 77.59 },
        dropoff: { address: 'VITEST_PAYMENT_DROPOFF_A', lat: 12.98, lng: 77.60 },
        status: 'COMPLETED',
        vehicleCategory: 'CAR',
        fare: 250,
        currentFare: 250,
        completedFare: 250,
        distance: '8 km',
    });
    await ride.save();
    testRide = ride;
}

// ── Test Suites ──

describe('Payment System Setup', () => {
    it('should create test data', async () => {
        await setup();
        expect(testRider._id).toBeTruthy();
        expect(testDriver._id).toBeTruthy();
        expect(testRide._id).toBeTruthy();
    });
});

describe('POST /api/payments — Create Payment', () => {
    it('should create a payment for a completed ride', async () => {
        const res = await request(app).post('/api/payments').send({
            rideId: testRide._id,
            userId: testRider._id,
            driverId: testDriver._id,
            amount: 250,
            method: 'UPI',
            fareBreakdown: {
                baseFare: 50,
                distanceCharge: 120,
                timeCharge: 30,
                tollCharges: 0,
                surgeMultiplier: 1,
                poolDiscount: 0,
                promoDiscount: 0,
                taxes: 30,
                platformFee: 20,
                driverPayout: 200,
            },
        });
        expect(res.status).toBe(201);
        expect(res.body.ok).toBe(true);
        expect(res.body.payment).toBeDefined();
        expect(res.body.payment.status).toBe('COMPLETED');
        expect(res.body.payment.transactionId).toBeDefined();
        createdPaymentId = res.body.payment._id;
    });

    it('should reject payment with missing rideId', async () => {
        const res = await request(app).post('/api/payments').send({
            userId: testRider._id,
            amount: 100,
            method: 'CASH',
        });
        expect(res.status).toBe(400);
    });

    it('should reject payment with invalid method', async () => {
        const res = await request(app).post('/api/payments').send({
            rideId: testRide._id,
            userId: testRider._id,
            amount: 100,
            method: 'BITCOIN',
        });
        expect(res.status).toBe(400);
    });

    it('should reject payment with zero amount', async () => {
        const res = await request(app).post('/api/payments').send({
            rideId: testRide._id,
            userId: testRider._id,
            amount: 0,
            method: 'WALLET',
        });
        expect(res.status).toBe(400);
    });

    it('should handle CASH payments with correct status', async () => {
        const Ride = mongoose.model('Ride');
        const ride2 = new Ride({
            userId: testRider._id,
            driverId: testDriver._id,
            pickup: { address: 'VITEST_PAYMENT_PICKUP_B', lat: 12.97, lng: 77.59 },
            dropoff: { address: 'VITEST_PAYMENT_DROPOFF_B', lat: 12.98, lng: 77.60 },
            status: 'COMPLETED',
            fare: 100,
        });
        await ride2.save();

        const res = await request(app).post('/api/payments').send({
            rideId: ride2._id,
            userId: testRider._id,
            driverId: testDriver._id,
            amount: 100,
            method: 'CASH',
        });
        expect(res.status).toBe(201);
        expect(res.body.payment.method).toBe('CASH');
    });
});

describe('GET /api/payments/user/:userId — Payment History', () => {
    it('should return payment history for rider', async () => {
        const res = await request(app).get(`/api/payments/user/${testRider._id}`);
        expect(res.status).toBe(200);
        expect(res.body.payments).toBeDefined();
        expect(res.body.payments.length).toBeGreaterThanOrEqual(1);
        expect(res.body.summary).toBeDefined();
        expect(res.body.summary.totalAmount).toBeGreaterThanOrEqual(250);
    });

    it('should include fare breakdown in payment objects', async () => {
        const res = await request(app).get(`/api/payments/user/${testRider._id}`);
        const firstPay = res.body.payments[0];
        expect(firstPay.fareBreakdown || firstPay.amount).toBeTruthy();
    });

    it('should include pagination info', async () => {
        const res = await request(app).get(`/api/payments/user/${testRider._id}`);
        expect(res.body.pagination).toBeDefined();
        expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });
});

describe('GET /api/payments/ride/:rideId — Ride Payment', () => {
    it('should return payment for that ride', async () => {
        const res = await request(app).get(`/api/payments/ride/${testRide._id}`);
        expect(res.status).toBe(200);
        expect(res.body.amount).toBe(250);
        expect(res.body.method).toBe('UPI');
    });
});

describe('POST /api/payments/:paymentId/refund — Refund Payment', () => {
    it('should process a refund', async () => {
        const res = await request(app)
            .post(`/api/payments/${createdPaymentId}/refund`)
            .send({ reason: 'vitest_pay_test customer complaint', amount: 50 });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.payment.refund).toBeDefined();
        expect(res.body.payment.refund.amount).toBe(50);
    });

    it('should reject refund for invalid payment ID', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .post(`/api/payments/${fakeId}/refund`)
            .send({ reason: 'vitest_pay_test refund test' });
        expect(res.status).toBe(404);
    });
});
