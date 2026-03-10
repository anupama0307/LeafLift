/**
 * Feature: Review & Rating System Tests
 * Tests review CRUD, rating calculations, moderation, reporting
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
        const Review = mongoose.model('Review');

        await User.deleteMany({ email: /vitest_review_.*@test\.com/ });
        await Ride.deleteMany({ 'pickup.address': /VITEST_REVIEW_PICKUP/ });
        await Review.deleteMany({ comment: /vitest_review_test/ });
    } catch (_) {}
    await mongoose.connection.close();
});

// ── Helpers ──
let testRider, testDriver, testRide;

async function createTestUsers() {
    const riderRes = await request(app).post('/api/signup').send({
        role: 'RIDER',
        email: `vitest_review_rider_${Date.now()}@test.com`,
        phone: '9800000001',
        firstName: 'ReviewTest',
        lastName: 'Rider',
        dob: '1995-01-01',
        gender: 'Male',
    });
    testRider = riderRes.body.user;

    const driverRes = await request(app).post('/api/signup').send({
        role: 'DRIVER',
        email: `vitest_review_driver_${Date.now()}@test.com`,
        phone: '9800000002',
        firstName: 'ReviewTest',
        lastName: 'Driver',
        dob: '1990-01-01',
        gender: 'Male',
    });
    testDriver = driverRes.body.user;
}

async function createCompletedRide() {
    const Ride = mongoose.model('Ride');
    const ride = new Ride({
        userId: testRider._id,
        driverId: testDriver._id,
        pickup: { address: 'VITEST_REVIEW_PICKUP_A', lat: 12.97, lng: 77.59 },
        dropoff: { address: 'VITEST_REVIEW_DROPOFF_A', lat: 12.98, lng: 77.60 },
        status: 'COMPLETED',
        vehicleCategory: 'CAR',
        fare: 150,
        currentFare: 150,
        completedFare: 150,
        distance: '5 km',
    });
    await ride.save();
    testRide = ride;
}

// ── Test Suites ──

describe('Review System Setup', () => {
    it('should create test users and a completed ride', async () => {
        await createTestUsers();
        expect(testRider._id).toBeTruthy();
        expect(testDriver._id).toBeTruthy();

        await createCompletedRide();
        expect(testRide._id).toBeTruthy();
        expect(testRide.status).toBe('COMPLETED');
    });
});

describe('POST /api/reviews — Create Review', () => {
    it('should create a review with valid data', async () => {
        const res = await request(app).post('/api/reviews').send({
            rideId: testRide._id,
            reviewerId: testRider._id,
            reviewerRole: 'RIDER',
            rating: 5,
            comment: 'vitest_review_test excellent driver',
            tags: ['SAFE_DRIVER', 'CLEAN_CAR'],
            subRatings: { safety: 5, punctuality: 5, cleanliness: 4 },
        });
        expect(res.status).toBe(201);
        expect(res.body.ok).toBe(true);
        expect(res.body.review).toBeDefined();
        expect(res.body.review.rating).toBe(5);
        expect(res.body.review.sentimentLabel).toBe('POSITIVE');
    });

    it('should reject duplicate review for same ride', async () => {
        const res = await request(app).post('/api/reviews').send({
            rideId: testRide._id,
            reviewerId: testRider._id,
            reviewerRole: 'RIDER',
            rating: 4,
            comment: 'vitest_review_test second attempt',
        });
        expect(res.status).toBe(409);
    });

    it('should reject review with missing fields', async () => {
        const res = await request(app).post('/api/reviews').send({
            rideId: testRide._id,
        });
        expect(res.status).toBe(400);
    });

    it('should reject review with invalid rating', async () => {
        const res = await request(app).post('/api/reviews').send({
            rideId: testRide._id,
            reviewerId: testDriver._id,
            reviewerRole: 'DRIVER',
            rating: 7,
        });
        expect(res.status).toBe(400);
    });

    it('should reject review for non-completed ride', async () => {
        const Ride = mongoose.model('Ride');
        const inProgressRide = new Ride({
            userId: testRider._id,
            driverId: testDriver._id,
            pickup: { address: 'VITEST_REVIEW_PICKUP_InProgress', lat: 12.97, lng: 77.59 },
            dropoff: { address: 'VITEST_REVIEW_DROPOFF_InProgress', lat: 12.98, lng: 77.60 },
            status: 'IN_PROGRESS',
            fare: 100,
        });
        await inProgressRide.save();

        const res = await request(app).post('/api/reviews').send({
            rideId: inProgressRide._id,
            reviewerId: testRider._id,
            rating: 3,
        });
        expect(res.status).toBe(400);
        await Ride.deleteOne({ _id: inProgressRide._id });
    });

    it('should calculate negative sentiment for low rating + negative tags', async () => {
        const Ride = mongoose.model('Ride');
        const ride2 = new Ride({
            userId: testRider._id,
            driverId: testDriver._id,
            pickup: { address: 'VITEST_REVIEW_PICKUP_B', lat: 12.97, lng: 77.59 },
            dropoff: { address: 'VITEST_REVIEW_DROPOFF_B', lat: 12.98, lng: 77.60 },
            status: 'COMPLETED',
            fare: 100,
        });
        await ride2.save();

        const res = await request(app).post('/api/reviews').send({
            rideId: ride2._id,
            reviewerId: testRider._id,
            reviewerRole: 'RIDER',
            rating: 1,
            comment: 'vitest_review_test terrible experience',
            tags: ['UNSAFE_DRIVING', 'RUDE_BEHAVIOR'],
        });
        expect(res.status).toBe(201);
        expect(res.body.review.sentimentLabel).toBe('NEGATIVE');
    });
});

describe('GET /api/reviews/user/:userId — Fetch User Reviews', () => {
    it('should fetch reviews for the driver', async () => {
        const res = await request(app).get(`/api/reviews/user/${testDriver._id}`);
        expect(res.status).toBe(200);
        expect(res.body.reviews).toBeDefined();
        expect(res.body.stats).toBeDefined();
        expect(res.body.stats.totalReviews).toBeGreaterThanOrEqual(1);
        expect(res.body.stats.avgRating).toBeGreaterThan(0);
        expect(res.body.stats.ratingDistribution).toBeDefined();
        expect(res.body.pagination).toBeDefined();
    });

    it('should include top tags in stats', async () => {
        const res = await request(app).get(`/api/reviews/user/${testDriver._id}`);
        expect(res.body.stats.topTags).toBeDefined();
        expect(Array.isArray(res.body.stats.topTags)).toBe(true);
    });

    it('should include sentiment breakdown in stats', async () => {
        const res = await request(app).get(`/api/reviews/user/${testDriver._id}`);
        const { sentimentBreakdown } = res.body.stats;
        expect(sentimentBreakdown).toBeDefined();
        expect(sentimentBreakdown.POSITIVE + sentimentBreakdown.NEUTRAL + sentimentBreakdown.NEGATIVE)
            .toBe(res.body.stats.totalReviews);
    });
});

describe('GET /api/reviews/ride/:rideId — Fetch Ride Reviews', () => {
    it('should fetch reviews for a specific ride', async () => {
        const res = await request(app).get(`/api/reviews/ride/${testRide._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
});

describe('POST /api/reviews/:reviewId/report — Report Review', () => {
    it('should report a review for moderation', async () => {
        const reviewsRes = await request(app).get(`/api/reviews/ride/${testRide._id}`);
        const reviewId = reviewsRes.body[0]._id;

        const res = await request(app).post(`/api/reviews/${reviewId}/report`).send({
            reportReason: 'Inappropriate language — vitest test',
        });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});
