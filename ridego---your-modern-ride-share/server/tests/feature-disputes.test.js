/**
 * Feature: Dispute Resolution System Tests
 * Tests dispute creation, messaging, resolution, SLA
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
        const Dispute = mongoose.model('Dispute');

        await User.deleteMany({ email: /vitest_dispute_.*@test\.com/ });
        await Ride.deleteMany({ 'pickup.address': /VITEST_DISPUTE_PICKUP/ });
        await Dispute.deleteMany({ description: /vitest_dispute_test/ });
    } catch (_) {}
    await mongoose.connection.close();
});

// ── Helpers ──
let testRider, testDriver, testRide, createdDisputeId;

async function setup() {
    const riderRes = await request(app).post('/api/signup').send({
        role: 'RIDER',
        email: `vitest_dispute_rider_${Date.now()}@test.com`,
        phone: '9822000001',
        firstName: 'DisputeTest',
        lastName: 'Rider',
        dob: '1996-03-15',
        gender: 'Male',
    });
    testRider = riderRes.body.user;

    const driverRes = await request(app).post('/api/signup').send({
        role: 'DRIVER',
        email: `vitest_dispute_driver_${Date.now()}@test.com`,
        phone: '9822000002',
        firstName: 'DisputeTest',
        lastName: 'Driver',
        dob: '1991-06-20',
        gender: 'Female',
    });
    testDriver = driverRes.body.user;

    const Ride = mongoose.model('Ride');
    const ride = new Ride({
        userId: testRider._id,
        driverId: testDriver._id,
        pickup: { address: 'VITEST_DISPUTE_PICKUP_A', lat: 12.97, lng: 77.59 },
        dropoff: { address: 'VITEST_DISPUTE_DROPOFF_A', lat: 12.98, lng: 77.60 },
        status: 'COMPLETED',
        vehicleCategory: 'AUTO',
        fare: 200,
        distance: '6 km',
    });
    await ride.save();
    testRide = ride;
}

// ── Tests ──

describe('Dispute System Setup', () => {
    it('should create test data', async () => {
        await setup();
        expect(testRider._id).toBeTruthy();
        expect(testDriver._id).toBeTruthy();
        expect(testRide._id).toBeTruthy();
    });
});

describe('POST /api/disputes — Create Dispute', () => {
    it('should create a dispute for a completed ride', async () => {
        const res = await request(app).post('/api/disputes').send({
            rideId: testRide._id,
            raisedBy: testRider._id,
            category: 'FARE_DISPUTE',
            description: 'vitest_dispute_test fare was higher than estimated',
            priority: 'MEDIUM',
        });
        expect(res.status).toBe(201);
        expect(res.body.ok).toBe(true);
        expect(res.body.dispute).toBeDefined();
        expect(res.body.dispute.status).toBe('OPEN');
        expect(res.body.dispute.category).toBe('FARE_DISPUTE');
        createdDisputeId = res.body.dispute._id;
    });

    it('should create a high-priority safety dispute', async () => {
        const Ride = mongoose.model('Ride');
        const ride2 = new Ride({
            userId: testRider._id,
            driverId: testDriver._id,
            pickup: { address: 'VITEST_DISPUTE_PICKUP_B', lat: 12.97, lng: 77.59 },
            dropoff: { address: 'VITEST_DISPUTE_DROPOFF_B', lat: 12.98, lng: 77.60 },
            status: 'COMPLETED',
            fare: 150,
        });
        await ride2.save();

        const res = await request(app).post('/api/disputes').send({
            rideId: ride2._id,
            raisedBy: testRider._id,
            category: 'SAFETY_CONCERN',
            description: 'vitest_dispute_test driver drove recklessly',
            priority: 'CRITICAL',
        });
        expect(res.status).toBe(201);
        expect(res.body.dispute.priority).toBe('CRITICAL');
    });

    it('should reject dispute without rideId', async () => {
        const res = await request(app).post('/api/disputes').send({
            raisedBy: testRider._id,
            category: 'FARE_DISPUTE',
            description: 'vitest_dispute_test missing ride',
        });
        expect(res.status).toBe(400);
    });

    it('should reject dispute with invalid category', async () => {
        const res = await request(app).post('/api/disputes').send({
            rideId: testRide._id,
            raisedBy: testRider._id,
            category: 'INVALID_CATEGORY',
            description: 'vitest_dispute_test bad category',
        });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/disputes/user/:userId — User Disputes', () => {
    it('should list disputes raised by user', async () => {
        const res = await request(app).get(`/api/disputes/user/${testRider._id}`);
        expect(res.status).toBe(200);
        expect(res.body.disputes).toBeDefined();
        expect(res.body.disputes.length).toBeGreaterThanOrEqual(1);
        expect(res.body.pagination).toBeDefined();
    });
});

describe('GET /api/disputes/:disputeId — Get Single Dispute', () => {
    it('should retrieve dispute details', async () => {
        const res = await request(app).get(`/api/disputes/${createdDisputeId}`);
        expect(res.status).toBe(200);
        expect(res.body._id.toString()).toBe(createdDisputeId.toString());
        expect(res.body.category).toBe('FARE_DISPUTE');
    });

    it('should return 404 for non-existent dispute', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app).get(`/api/disputes/${fakeId}`);
        expect(res.status).toBe(404);
    });
});

describe('POST /api/disputes/:disputeId/messages — Add Message', () => {
    it('should add a message to the dispute', async () => {
        const res = await request(app)
            .post(`/api/disputes/${createdDisputeId}/messages`)
            .send({
                senderId: testRider._id,
                senderRole: 'RIDER',
                content: 'vitest_dispute_test I was charged 200 but estimated was 150',
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.dispute.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should add a second message from admin', async () => {
        const res = await request(app)
            .post(`/api/disputes/${createdDisputeId}/messages`)
            .send({
                senderId: testDriver._id,
                senderRole: 'ADMIN',
                content: 'vitest_dispute_test We are reviewing your fare complaint',
            });
        expect(res.status).toBe(200);
        expect(res.body.dispute.messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject message without content', async () => {
        const res = await request(app)
            .post(`/api/disputes/${createdDisputeId}/messages`)
            .send({ senderId: testRider._id });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/disputes/:disputeId/resolve — Resolve Dispute', () => {
    it('should resolve the dispute', async () => {
        const res = await request(app)
            .post(`/api/disputes/${createdDisputeId}/resolve`)
            .send({
                resolvedBy: testDriver._id,
                resolutionNotes: 'vitest_dispute_test fare adjusted to estimated amount',
                action: 'PARTIAL_REFUND',
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.dispute.status).toBe('RESOLVED');
        expect(res.body.dispute.resolution).toBeDefined();
    });

    it('should reject resolving an already resolved dispute', async () => {
        const res = await request(app)
            .post(`/api/disputes/${createdDisputeId}/resolve`)
            .send({
                resolvedBy: testDriver._id,
                resolutionNotes: 'vitest_dispute_test trying again',
            });
        expect(res.status).toBe(400);
    });
});
