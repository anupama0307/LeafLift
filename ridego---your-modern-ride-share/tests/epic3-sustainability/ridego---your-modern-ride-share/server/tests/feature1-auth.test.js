/**
 * Feature 1: Authentication Integration Tests
 * Tests all /api auth routes: health, signup, login, send-otp, verify-otp, user profile CRUD
 * Uses Supertest against Express app with real MongoDB Atlas
 */

let app, otpStore, request, mongoose;

beforeAll(async () => {
    // Dynamic imports for CJS compat (vitest is ESM, server is CJS)
    const supertest = await import('supertest');
    request = supertest.default;
    mongoose = (await import('mongoose')).default;

    const server = await import('../index.js');
    app = server.app;
    otpStore = server.otpStore;

    // Wait for MongoDB connection
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            mongoose.connection.once('connected', resolve);
            setTimeout(resolve, 8000); // fallback timeout
        });
    }
});

afterAll(async () => {
    // Clean up test users created during tests
    try {
        const User = mongoose.model('User');
        await User.deleteMany({ email: /vitest_auth_.*@test\.com/ });
    } catch (_) {}

    await mongoose.connection.close();
});

// ─── Health Check ───
describe('Health Check', () => {
    it('GET /api/health should return status ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});

// ─── Signup ───
describe('Signup — POST /api/signup', () => {
    const testEmail = `vitest_auth_signup_${Date.now()}@test.com`;

    it('should create a new RIDER user with all required fields', async () => {
        const res = await request(app).post('/api/signup').send({
            role: 'RIDER',
            email: testEmail,
            phone: '9876543210',
            firstName: 'Vitest',
            lastName: 'Rider',
            dob: '2000-01-01',
            gender: 'Male',
            authProvider: 'email',
        });
        expect(res.status).toBe(201);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(testEmail);
        expect(res.body.user.role).toBe('RIDER');
    });

    it('should reject duplicate email signup', async () => {
        const res = await request(app).post('/api/signup').send({
            role: 'RIDER',
            email: testEmail,
            phone: '9876543211',
            firstName: 'Dup',
            lastName: 'User',
            dob: '2000-01-01',
            gender: 'Female',
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it('should return 500 if required fields are missing', async () => {
        const res = await request(app).post('/api/signup').send({
            email: `vitest_auth_incomplete_${Date.now()}@test.com`,
        });
        // Missing role, phone, firstName, etc → Mongoose validation error → 500
        expect(res.status).toBe(500);
    });

    it('should create a DRIVER with vehicle defaults', async () => {
        const driverEmail = `vitest_auth_driver_${Date.now()}@test.com`;
        const res = await request(app).post('/api/signup').send({
            role: 'DRIVER',
            email: driverEmail,
            phone: '8888888888',
            firstName: 'Vitest',
            lastName: 'Driver',
            dob: '1995-06-15',
            gender: 'Male',
            license: 'DL-1234567',
            aadhar: '1234-5678-9012',
        });
        expect(res.status).toBe(201);
        expect(res.body.user.role).toBe('DRIVER');
        // Server applies vehicle defaults for drivers
        expect(res.body.user.vehicleMake).toBeDefined();
        expect(res.body.user.vehicleNumber).toBeDefined();
    });
});

// ─── Login ───
describe('Login — POST /api/login', () => {
    let loginTestEmail;

    beforeAll(async () => {
        // Create a user to login with
        loginTestEmail = `vitest_auth_login_${Date.now()}@test.com`;
        await request(app).post('/api/signup').send({
            role: 'RIDER',
            email: loginTestEmail,
            phone: '7777777777',
            firstName: 'Login',
            lastName: 'Tester',
            dob: '1998-03-20',
            gender: 'Female',
        });
    });

    it('should find an existing user by email', async () => {
        const res = await request(app).post('/api/login').send({ email: loginTestEmail });
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(true);
        expect(res.body.user.email).toBe(loginTestEmail);
    });

    it('should return exists=false for non-existent email', async () => {
        const res = await request(app).post('/api/login').send({ email: 'nonexistent_999@test.com' });
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(false);
    });

    it('should find user by phone + role', async () => {
        const res = await request(app).post('/api/login').send({ phone: '7777777777', role: 'RIDER' });
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(true);
    });

    it('should handle empty body gracefully', async () => {
        const res = await request(app).post('/api/login').send({});
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(false);
    });
});

// ─── Send OTP ───
describe('Send OTP — POST /api/send-otp', () => {
    it('should send OTP for valid email', async () => {
        const res = await request(app).post('/api/send-otp').send({ email: 'vitest_otp_test@test.com' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/otp sent/i);
    });

    it('should return 400 if email is missing', async () => {
        const res = await request(app).post('/api/send-otp').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/email.*required/i);
    });
});

// ─── Verify OTP ───
describe('Verify OTP — POST /api/verify-otp', () => {
    it('should return 400 if email or OTP is missing', async () => {
        const res = await request(app).post('/api/verify-otp').send({ email: 'test@test.com' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/required/i);
    });

    it('should return 400 for wrong OTP', async () => {
        // First send an OTP
        await request(app).post('/api/send-otp').send({ email: 'vitest_wrong_otp@test.com' });
        const res = await request(app).post('/api/verify-otp').send({
            email: 'vitest_wrong_otp@test.com',
            otp: '000000',
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid/i);
    });

    it('should verify the correct OTP from otpStore', async () => {
        const email = 'vitest_correct_otp@test.com';
        // Inject OTP directly into the store
        otpStore.set(email, { otp: '123456', expiresAt: Date.now() + 300000 });

        const res = await request(app).post('/api/verify-otp').send({ email, otp: '123456' });
        expect(res.status).toBe(200);
        expect(res.body.verified).toBe(true);
    });

    it('should return 400 for expired OTP', async () => {
        const email = 'vitest_expired_otp@test.com';
        otpStore.set(email, { otp: '654321', expiresAt: Date.now() - 1000 }); // expired

        const res = await request(app).post('/api/verify-otp').send({ email, otp: '654321' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/expired/i);
    });

    it('should return 400 when no OTP was ever stored', async () => {
        const res = await request(app).post('/api/verify-otp').send({
            email: 'vitest_no_stored_otp@test.com',
            otp: '111111',
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/no otp found/i);
    });
});

// ─── User Profile CRUD ───
describe('User Profile', () => {
    let userId;

    beforeAll(async () => {
        const email = `vitest_auth_profile_${Date.now()}@test.com`;
        const res = await request(app).post('/api/signup').send({
            role: 'RIDER',
            email,
            phone: '6666666666',
            firstName: 'Profile',
            lastName: 'Tester',
            dob: '1999-07-07',
            gender: 'Male',
        });
        userId = res.body.user._id;
    });

    it('GET /api/users/:userId should return the user', async () => {
        const res = await request(app).get(`/api/users/${userId}`);
        expect(res.status).toBe(200);
        expect(res.body.firstName).toBe('Profile');
    });

    it('GET /api/users/:userId should return 404 for invalid ID', async () => {
        const res = await request(app).get('/api/users/000000000000000000000000');
        expect(res.status).toBe(404);
    });

    it('PUT /api/users/:userId should update allowed fields', async () => {
        const res = await request(app).put(`/api/users/${userId}`).send({
            firstName: 'Updated',
            phone: '5555555555',
        });
        expect(res.status).toBe(200);
        expect(res.body.firstName).toBe('Updated');
        expect(res.body.phone).toBe('5555555555');
    });

    it('PUT /api/users/:userId should ignore disallowed fields', async () => {
        const res = await request(app).put(`/api/users/${userId}`).send({
            role: 'DRIVER', // not in allowedFields
            walletBalance: 99999, // not in allowedFields
            firstName: 'StillAllowed',
        });
        expect(res.status).toBe(200);
        expect(res.body.firstName).toBe('StillAllowed');
        expect(res.body.role).toBe('RIDER'); // unchanged
    });
});
