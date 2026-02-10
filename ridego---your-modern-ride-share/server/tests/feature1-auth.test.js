/**
 * Feature 1: Authentication — Backend Integration Tests
 * 
 * Tests the /api/signup, /api/login, /api/send-otp, /api/verify-otp endpoints
 * using Supertest + Vitest against the real Express app.
 * 
 * Uses Vitest globals (describe, it, expect) — no import needed.
 */

import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Dynamic import for CJS module
const serverModule = await import('../index.js');
const { app, httpServer, otpStore } = serverModule;

// Import mongoose for cleanup — use mongoose.models to get already-compiled models
const mongooseModule = await import('mongoose');
const mongoose = mongooseModule.default;
const User = mongoose.model('User');

// Unique email per test run to avoid collisions
const TEST_EMAIL = `testuser_${Date.now()}@leaflift-test.com`;
const TEST_PHONE = `+919${Date.now().toString().slice(-9)}`;
let createdUserId = null;

describe('Feature 1: Authentication — Backend API', () => {

    afterAll(async () => {
        // Clean up test user
        if (createdUserId) {
            try {
                await User.findByIdAndDelete(createdUserId);
            } catch (e) { /* ignore */ }
        }
        // Close connections
        try {
            httpServer.close();
            await mongoose.connection.close();
        } catch (e) { /* ignore */ }
    });

    // ─── Health Check ───
    describe('GET /api/health', () => {
        it('should return 200 with status ok', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });
    });

    // ─── Signup ───
    describe('POST /api/signup', () => {
        it('should create a new RIDER user with valid data', async () => {
            const res = await request(app)
                .post('/api/signup')
                .send({
                    role: 'RIDER',
                    email: TEST_EMAIL,
                    phone: TEST_PHONE,
                    firstName: 'Test',
                    lastName: 'User',
                    dob: '2000-01-01',
                    gender: 'Male',
                    authProvider: 'email',
                });
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('user');
            expect(res.body.user).toHaveProperty('email', TEST_EMAIL);
            expect(res.body.user).toHaveProperty('role', 'RIDER');
            expect(res.body.user).toHaveProperty('firstName', 'Test');
            createdUserId = res.body.user._id;
        });

        it('should reject duplicate email signup', async () => {
            const res = await request(app)
                .post('/api/signup')
                .send({
                    role: 'RIDER',
                    email: TEST_EMAIL,
                    phone: '+919876543210',
                    firstName: 'Duplicate',
                    lastName: 'User',
                    dob: '2000-01-01',
                    gender: 'Female',
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/already exists/i);
        });

        it('should return 500 for missing required fields', async () => {
            const res = await request(app)
                .post('/api/signup')
                .send({ role: 'RIDER', email: `partial_${Date.now()}@test.com` });
            // Mongoose validation error → 500
            expect(res.status).toBe(500);
        });

        it('should create a DRIVER user with vehicle details', async () => {
            const driverEmail = `driver_${Date.now()}@leaflift-test.com`;
            const res = await request(app)
                .post('/api/signup')
                .send({
                    role: 'DRIVER',
                    email: driverEmail,
                    phone: `+918${Date.now().toString().slice(-9)}`,
                    firstName: 'Driver',
                    lastName: 'Test',
                    dob: '1995-06-15',
                    gender: 'Male',
                    license: 'DL-1234567890',
                    aadhar: '123456789012',
                    vehicleMake: 'Tata',
                    vehicleModel: 'Nexon',
                    vehicleNumber: 'TN 37 ZZ 9999',
                });
            expect(res.status).toBe(201);
            expect(res.body.user).toHaveProperty('role', 'DRIVER');
            expect(res.body.user).toHaveProperty('vehicleMake', 'Tata');
            expect(res.body.user).toHaveProperty('vehicleNumber', 'TN 37 ZZ 9999');

            // Cleanup driver
            await User.findByIdAndDelete(res.body.user._id);
        });
    });

    // ─── Login ───
    describe('POST /api/login', () => {
        it('should find existing user by email', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ email: TEST_EMAIL });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('exists', true);
            expect(res.body.user).toHaveProperty('email', TEST_EMAIL);
        });

        it('should return exists=false for non-existent email', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ email: 'nobody_exists_xyz@fake.com' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('exists', false);
            expect(res.body.user).toBeNull();
        });

        it('should find user by phone and role', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ phone: TEST_PHONE, role: 'RIDER' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('exists', true);
        });

        it('should handle empty body gracefully', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({});
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('exists', false);
        });
    });

    // ─── Email OTP ───
    describe('POST /api/send-otp', () => {
        it('should send OTP to valid email', async () => {
            const res = await request(app)
                .post('/api/send-otp')
                .send({ email: TEST_EMAIL });
            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/otp sent/i);
        });

        it('should reject request without email', async () => {
            const res = await request(app)
                .post('/api/send-otp')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/email.*required/i);
        });
    });

    describe('POST /api/verify-otp', () => {
        it('should reject missing email/otp fields', async () => {
            const res = await request(app)
                .post('/api/verify-otp')
                .send({});
            expect(res.status).toBe(400);
        });

        it('should reject wrong OTP', async () => {
            // First send an OTP
            await request(app)
                .post('/api/send-otp')
                .send({ email: TEST_EMAIL });

            const res = await request(app)
                .post('/api/verify-otp')
                .send({ email: TEST_EMAIL, otp: '000000' });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/invalid/i);
        });

        it('should verify correct OTP', async () => {
            // Send OTP first
            await request(app)
                .post('/api/send-otp')
                .send({ email: TEST_EMAIL });

            // Get the stored OTP from the in-memory store
            const stored = otpStore.get(TEST_EMAIL);
            expect(stored).toBeDefined();

            const res = await request(app)
                .post('/api/verify-otp')
                .send({ email: TEST_EMAIL, otp: stored.otp });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('verified', true);
        });

        it('should reject expired OTP', async () => {
            // Manually insert an expired OTP
            otpStore.set('expired@test.com', {
                otp: '999999',
                expiresAt: Date.now() - 10000, // expired 10 seconds ago
            });

            const res = await request(app)
                .post('/api/verify-otp')
                .send({ email: 'expired@test.com', otp: '999999' });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/expired/i);
        });

        it('should reject OTP for email with no stored OTP', async () => {
            const res = await request(app)
                .post('/api/verify-otp')
                .send({ email: 'no_otp_stored@test.com', otp: '123456' });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/no otp found/i);
        });
    });

    // ─── User Profile Routes (protected-like) ───
    describe('User Profile Endpoints', () => {
        it('GET /api/users/:userId should return the test user', async () => {
            const res = await request(app).get(`/api/users/${createdUserId}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('email', TEST_EMAIL);
        });

        it('GET /api/users/:userId should return 404 for invalid ID', async () => {
            const fakeId = '000000000000000000000000';
            const res = await request(app).get(`/api/users/${fakeId}`);
            expect(res.status).toBe(404);
        });

        it('PUT /api/users/:userId should update allowed fields', async () => {
            const res = await request(app)
                .put(`/api/users/${createdUserId}`)
                .send({ firstName: 'UpdatedName' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('firstName', 'UpdatedName');
        });

        it('PUT /api/users/:userId should not update disallowed fields', async () => {
            const res = await request(app)
                .put(`/api/users/${createdUserId}`)
                .send({ role: 'DRIVER', walletBalance: 99999 });
            expect(res.status).toBe(200);
            // role and walletBalance are not in allowedFields, so should remain unchanged
            expect(res.body).toHaveProperty('role', 'RIDER');
        });
    });
});
