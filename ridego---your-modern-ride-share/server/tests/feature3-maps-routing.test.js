/**
 * Feature 3: Maps Routing Integration Tests
 * Tests OLA Maps proxy routes (/api/ola/*), ride creation, nearby filtering, 
 * and ride status updates via Supertest against real Express + MongoDB.
 */

let app, request, mongoose;

beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;
    mongoose = (await import('mongoose')).default;

    const server = await import('../index.js');
    app = server.app;

    // Wait for MongoDB connection
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            mongoose.connection.once('connected', resolve);
            setTimeout(resolve, 8000);
        });
    }
});

afterAll(async () => {
    // Clean up test rides
    try {
        const Ride = mongoose.model('Ride');
        await Ride.deleteMany({ 'pickup.address': /Vitest_Maps/i });
    } catch (_) {}

    await mongoose.connection.close();
});

// ─── OLA Autocomplete ───
describe('OLA Autocomplete — GET /api/ola/autocomplete', () => {
    it('should return predictions for valid input', async () => {
        const res = await request(app).get('/api/ola/autocomplete?input=Kochi');
        expect(res.status).toBe(200);
        expect(res.body.predictions).toBeDefined();
        expect(res.body.predictions.length).toBeGreaterThan(0);
    });

    it('should accept location bias parameter', async () => {
        const res = await request(app).get('/api/ola/autocomplete?input=Kochi&location=9.93,76.26');
        expect(res.status).toBe(200);
        expect(res.body.predictions).toBeDefined();
    });

    it('should return 400 when input is missing', async () => {
        const res = await request(app).get('/api/ola/autocomplete');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/input/i);
    });

    it('should return predictions with valid Kochi coordinates (lat ~9-10, lng ~76-77)', async () => {
        const res = await request(app).get('/api/ola/autocomplete?input=Kochi');
        expect(res.status).toBe(200);
        const first = res.body.predictions[0];
        if (first?.geometry?.location) {
            const { lat, lng } = first.geometry.location;
            expect(lat).toBeGreaterThan(9);
            expect(lat).toBeLessThan(11);
            expect(lng).toBeGreaterThan(75);
            expect(lng).toBeLessThan(78);
        }
    });
});

// ─── OLA Directions ───
describe('OLA Directions — POST /api/ola/directions', () => {
    it('should return route between Kochi and Kottayam', async () => {
        const res = await request(app).post('/api/ola/directions').send({
            origin: '9.9312,76.2673',    // Kochi
            destination: '9.5916,76.5222', // Kottayam
        });
        expect(res.status).toBe(200);
        expect(res.body.routes).toBeDefined();
        expect(res.body.routes.length).toBeGreaterThan(0);
    });

    it('should return 400 when origin is missing', async () => {
        const res = await request(app).post('/api/ola/directions').send({
            destination: '9.5916,76.5222',
        });
        expect(res.status).toBe(400);
    });

    it('should return 400 when destination is missing', async () => {
        const res = await request(app).post('/api/ola/directions').send({
            origin: '9.9312,76.2673',
        });
        expect(res.status).toBe(400);
    });
});

// ─── OLA Reverse Geocode ───
describe('OLA Reverse Geocode — GET /api/ola/reverse-geocode', () => {
    it('should return address for valid latlng', async () => {
        const res = await request(app).get('/api/ola/reverse-geocode?latlng=9.9312,76.2673');
        expect(res.status).toBe(200);
        expect(res.body.results).toBeDefined();
    });

    it('should return 400 when latlng is missing', async () => {
        const res = await request(app).get('/api/ola/reverse-geocode');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/latlng/i);
    });
});

// ─── Ride Creation ───
describe('Ride Creation — POST /api/rides', () => {
    let testUserId;

    beforeAll(async () => {
        // Create a temp user for ride creation
        const User = mongoose.model('User');
        const user = new User({
            role: 'RIDER',
            email: `vitest_maps_rider_${Date.now()}@test.com`,
            phone: '1111111111',
            firstName: 'Maps',
            lastName: 'Tester',
            dob: '2000-01-01',
            gender: 'Male',
        });
        const saved = await user.save();
        testUserId = saved._id.toString();
    });

    afterAll(async () => {
        const User = mongoose.model('User');
        await User.findByIdAndDelete(testUserId);
    });

    it('should create a ride with Kochi pickup and Kottayam dropoff', async () => {
        const res = await request(app).post('/api/rides').send({
            userId: testUserId,
            pickup: { address: 'Vitest_Maps Kochi', lat: 9.9312, lng: 76.2673 },
            dropoff: { address: 'Vitest_Maps Kottayam', lat: 9.5916, lng: 76.5222 },
            fare: 350,
            rideType: 'Car',
            distance: '60 km',
            duration: '1h 30m',
        });
        expect(res.status).toBe(201);
        expect(res.body.pickup.address).toMatch(/kochi/i);
        expect(res.body.status).toBe('SEARCHING');
    });

    it('should return 400 when userId is missing', async () => {
        const res = await request(app).post('/api/rides').send({
            pickup: { address: 'Test', lat: 10, lng: 76 },
            dropoff: { address: 'Test2', lat: 10.1, lng: 76.1 },
            fare: 100,
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/userId/i);
    });
});

// ─── Nearby Ride Filtering ───
describe('Nearby Rides — GET /api/rides/nearby', () => {
    let nearbyUserId;

    beforeAll(async () => {
        // Create user + SEARCHING ride positioned at Kochi
        const User = mongoose.model('User');
        const Ride = mongoose.model('Ride');

        const user = new User({
            role: 'RIDER',
            email: `vitest_maps_nearby_${Date.now()}@test.com`,
            phone: '2222222222',
            firstName: 'Nearby',
            lastName: 'Tester',
            dob: '1999-01-01',
            gender: 'Female',
        });
        const saved = await user.save();
        nearbyUserId = saved._id.toString();

        await new Ride({
            userId: nearbyUserId,
            pickup: { address: 'Vitest_Maps Kochi Central', lat: 9.9312, lng: 76.2673 },
            dropoff: { address: 'Vitest_Maps Kottayam', lat: 9.5916, lng: 76.5222 },
            fare: 300,
            status: 'SEARCHING',
        }).save();
    });

    afterAll(async () => {
        const User = mongoose.model('User');
        const Ride = mongoose.model('Ride');
        await Ride.deleteMany({ userId: nearbyUserId });
        await User.findByIdAndDelete(nearbyUserId);
    });

    it('should find ride when searching near Kochi (within 6km)', async () => {
        const res = await request(app).get('/api/rides/nearby?lat=9.93&lng=76.27&radius=6');
        expect(res.status).toBe(200);
        const found = res.body.some((r) => r.pickup?.address?.includes('Vitest_Maps'));
        expect(found).toBe(true);
    });

    it('should NOT find Kochi ride when searching from Ettimadai (far away)', async () => {
        // Ettimadai is ~350km from Kochi
        const res = await request(app).get('/api/rides/nearby?lat=10.78&lng=76.97&radius=6');
        expect(res.status).toBe(200);
        const found = res.body.some((r) => r.pickup?.address?.includes('Vitest_Maps Kochi Central'));
        expect(found).toBe(false);
    });

    it('should return all SEARCHING rides when no lat/lng given', async () => {
        const res = await request(app).get('/api/rides/nearby');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

// ─── Ride Status Update ───
describe('Ride Status — PUT /api/rides/:rideId/status', () => {
    let statusRideId;

    beforeAll(async () => {
        const User = mongoose.model('User');
        const Ride = mongoose.model('Ride');

        const user = new User({
            role: 'RIDER',
            email: `vitest_maps_status_${Date.now()}@test.com`,
            phone: '3333333333',
            firstName: 'Status',
            lastName: 'Tester',
            dob: '1998-01-01',
            gender: 'Male',
        });
        const saved = await user.save();

        const ride = await new Ride({
            userId: saved._id,
            pickup: { address: 'Vitest_Maps StatusTest', lat: 9.93, lng: 76.26 },
            dropoff: { address: 'Vitest_Maps StatusDrop', lat: 9.59, lng: 76.52 },
            fare: 200,
            status: 'SEARCHING',
        }).save();
        statusRideId = ride._id.toString();
    });

    it('should update ride status to CANCELED', async () => {
        const res = await request(app).put(`/api/rides/${statusRideId}/status`).send({
            status: 'CANCELED',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CANCELED');
    });
});
