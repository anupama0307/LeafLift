/**
 * Feature 3: Maps Routing — Backend Integration Tests
 * 
 * Tests the OLA Maps proxy endpoints:
 * - GET /api/ola/autocomplete — place search
 * - POST /api/ola/directions — route calculation
 * - GET /api/ola/reverse-geocode — reverse geocoding
 * 
 * Also tests ride creation with coordinates and nearby ride filtering.
 * 
 * Uses Vitest globals (describe, it, expect) — no import needed.
 */

import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const serverModule = await import('../index.js');
const { app, httpServer } = serverModule;

const mongooseModule = await import('mongoose');
const mongoose = mongooseModule.default;

// Use already-compiled models (loaded by server/index.js)
const Ride = mongoose.model('Ride');
const User = mongoose.model('User');

let testRideId = null;
let testUserId = null;

describe('Feature 3: Maps Routing — Backend API', () => {

    afterAll(async () => {
        // Clean up test data
        try {
            if (testRideId) await Ride.findByIdAndDelete(testRideId);
            if (testUserId) await User.findByIdAndDelete(testUserId);
        } catch (e) { /* ignore */ }
        try {
            httpServer.close();
            await mongoose.connection.close();
        } catch (e) { /* ignore */ }
    });

    // ─── OLA Autocomplete Proxy ───
    describe('GET /api/ola/autocomplete', () => {
        it('should return predictions for valid place query', async () => {
            const res = await request(app)
                .get('/api/ola/autocomplete')
                .query({ input: 'Kochi' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('predictions');
            expect(Array.isArray(res.body.predictions)).toBe(true);
            expect(res.body.predictions.length).toBeGreaterThan(0);

            // Verify first prediction has expected structure
            const first = res.body.predictions[0];
            expect(first).toHaveProperty('description');
            expect(first).toHaveProperty('geometry');
            expect(first.geometry).toHaveProperty('location');
            expect(first.geometry.location).toHaveProperty('lat');
            expect(first.geometry.location).toHaveProperty('lng');
        });

        it('should return predictions with location bias', async () => {
            const res = await request(app)
                .get('/api/ola/autocomplete')
                .query({ input: 'Kottayam', location: '9.9312,76.2673' });
            expect(res.status).toBe(200);
            expect(res.body.predictions.length).toBeGreaterThan(0);
        });

        it('should reject request without input parameter', async () => {
            const res = await request(app)
                .get('/api/ola/autocomplete')
                .query({});
            expect(res.status).toBe(400);
        });

        it('should return valid coordinates for Kochi', async () => {
            const res = await request(app)
                .get('/api/ola/autocomplete')
                .query({ input: 'Kochi' });
            const kochi = res.body.predictions.find(
                (p) => p.description.toLowerCase().includes('kochi')
            );
            expect(kochi).toBeDefined();
            // Kochi is roughly at lat ~9.9, lng ~76.2
            const lat = kochi.geometry.location.lat;
            const lng = kochi.geometry.location.lng;
            expect(lat).toBeGreaterThan(9);
            expect(lat).toBeLessThan(11);
            expect(lng).toBeGreaterThan(75);
            expect(lng).toBeLessThan(78);
        });
    });

    // ─── OLA Directions Proxy ───
    describe('POST /api/ola/directions', () => {
        it('should return route between Kochi and Kottayam', async () => {
            const res = await request(app)
                .post('/api/ola/directions')
                .send({
                    origin: '9.9312,76.2673',     // Kochi
                    destination: '9.5916,76.5222', // Kottayam
                    alternatives: true,
                });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('routes');
            expect(Array.isArray(res.body.routes)).toBe(true);
            expect(res.body.routes.length).toBeGreaterThan(0);

            // verify route has legs with distance/duration
            const route = res.body.routes[0];
            expect(route).toHaveProperty('legs');
            expect(route.legs.length).toBeGreaterThan(0);
            expect(route.legs[0]).toHaveProperty('distance');
            expect(route.legs[0]).toHaveProperty('duration');
        });

        it('should reject request without origin', async () => {
            const res = await request(app)
                .post('/api/ola/directions')
                .send({ destination: '9.5916,76.5222' });
            expect(res.status).toBe(400);
        });

        it('should reject request without destination', async () => {
            const res = await request(app)
                .post('/api/ola/directions')
                .send({ origin: '9.9312,76.2673' });
            expect(res.status).toBe(400);
        });
    });

    // ─── OLA Reverse Geocode Proxy ───
    describe('GET /api/ola/reverse-geocode', () => {
        it('should return address for valid lat/lng', async () => {
            const res = await request(app)
                .get('/api/ola/reverse-geocode')
                .query({ latlng: '9.9312,76.2673' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('results');
            expect(Array.isArray(res.body.results)).toBe(true);
        });

        it('should reject request without latlng parameter', async () => {
            const res = await request(app)
                .get('/api/ola/reverse-geocode')
                .query({});
            expect(res.status).toBe(400);
        });
    });

    // ─── Ride Creation with Coordinates ───
    describe('POST /api/rides — with correct pickup/dropoff coords', () => {
        it('should create a ride with Kochi pickup → Kottayam dropoff', async () => {
            // First create a test user
            const userRes = await request(app)
                .post('/api/signup')
                .send({
                    role: 'RIDER',
                    email: `maptest_${Date.now()}@leaflift-test.com`,
                    phone: `+917${Date.now().toString().slice(-9)}`,
                    firstName: 'Map',
                    lastName: 'Tester',
                    dob: '1999-01-01',
                    gender: 'Male',
                });
            testUserId = userRes.body.user._id;

            const res = await request(app)
                .post('/api/rides')
                .send({
                    userId: testUserId,
                    status: 'SEARCHING',
                    pickup: {
                        address: 'Kochi',
                        lat: 9.9312,
                        lng: 76.2673,
                    },
                    dropoff: {
                        address: 'Kottayam',
                        lat: 9.5916,
                        lng: 76.5222,
                    },
                    fare: 490,
                    distance: '78.2 km',
                    duration: '120 min',
                    rideType: 'Car',
                    paymentMethod: 'Cash',
                    vehicleCategory: 'CAR',
                });
            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('_id');
            expect(res.body.pickup).toHaveProperty('lat', 9.9312);
            expect(res.body.pickup).toHaveProperty('lng', 76.2673);
            expect(res.body.pickup).toHaveProperty('address', 'Kochi');
            expect(res.body.dropoff).toHaveProperty('lat', 9.5916);
            expect(res.body.dropoff).toHaveProperty('address', 'Kottayam');
            testRideId = res.body._id;
        });

        it('should reject ride without userId', async () => {
            const res = await request(app)
                .post('/api/rides')
                .send({
                    pickup: { address: 'Test', lat: 10, lng: 76 },
                    dropoff: { address: 'Test2', lat: 11, lng: 77 },
                    fare: 100,
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/userId.*required/i);
        });
    });

    // ─── Nearby Rides Filtering ───
    describe('GET /api/rides/nearby — distance filtering', () => {
        it('should return the Kochi ride when querying near Kochi', async () => {
            // Query near Kochi (within 6km)
            const res = await request(app)
                .get('/api/rides/nearby')
                .query({ lat: 9.93, lng: 76.27, radius: 6 });
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            // Our test ride should be in the results
            const found = res.body.find((r) => r._id === testRideId);
            expect(found).toBeDefined();
        });

        it('should NOT return the Kochi ride when querying from Ettimadai', async () => {
            // Ettimadai is ~300km from Kochi
            const res = await request(app)
                .get('/api/rides/nearby')
                .query({ lat: 10.78, lng: 76.84, radius: 6 });
            expect(res.status).toBe(200);
            const found = res.body.find((r) => r._id === testRideId);
            expect(found).toBeUndefined(); // Should NOT find the Kochi ride from Ettimadai
        });

        it('should return all SEARCHING rides when no lat/lng given', async () => {
            const res = await request(app)
                .get('/api/rides/nearby');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    // ─── Ride Status Update ───
    describe('PUT /api/rides/:rideId/status', () => {
        it('should update ride status to CANCELED', async () => {
            if (!testRideId) return;
            const res = await request(app)
                .put(`/api/rides/${testRideId}/status`)
                .send({ status: 'CANCELED' });
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'CANCELED');
        });
    });
});
