/**
 * EPIC 1 — Test Setup
 * Shared MongoDB Memory Server + Mongoose models for all EPIC 1 tests.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

let mongoServer;

beforeAll(async() => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterEach(async() => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

afterAll(async() => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// ─── Inline Mongoose Schemas (independent — no imports from main app) ───

const UserSchema = new mongoose.Schema({
    role: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: { type: String, required: true },
    gender: { type: String, required: true },
    rating: { type: Number, default: 4.8 },
    totalCO2Saved: { type: Number, default: 0 },
    totalCO2Emitted: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    totalKmTraveled: { type: Number, default: 0 },
    dailyRoute: {
        source: { address: String, lat: Number, lng: Number },
        destination: { address: String, lat: Number, lng: Number },
        isActive: { type: Boolean, default: false },
    },
});

const RideSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
        type: String,
        enum: ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'],
        default: 'SEARCHING',
    },
    pickup: { address: String, lat: Number, lng: Number },
    dropoff: { address: String, lat: Number, lng: Number },
    fare: Number,
    distance: String,
    duration: String,
    vehicleCategory: { type: String, enum: ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'], default: 'CAR' },
    isPooled: { type: Boolean, default: false },
    pooledRiders: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, fareAdjustment: Number, joinedAt: Date }],
    passengers: { type: Number, default: 1 },
    maxPassengers: { type: Number, default: 4 },
    co2Emissions: { type: Number, default: 0 },
    co2Saved: { type: Number, default: 0 },
    actualDropoff: { address: String, lat: Number, lng: Number },
    actualDistanceMeters: { type: Number, default: 0 },
    completedFare: { type: Number, default: 0 },
    riderConfirmedComplete: { type: Boolean, default: false },
    paymentMethod: String,
    createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const Ride = mongoose.models.Ride || mongoose.model('Ride', RideSchema);

// ─── Shared Helper Functions (replicate production logic) ───

/**
 * Haversine distance between two lat/lng points in km.
 * This is the same algorithm used in server/index.js for route matching.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * CO₂ calculation — same logic as PlanRideScreen.tsx calculateCO2()
 */
export function calculateCO2(distanceKm, vehicleCategory, isPooled) {
    const rates = { BIKE: 20, AUTO: 60, CAR: 120, BIG_CAR: 180 };
    const poolRate = 40; // g/km for pooled rides
    const rate = isPooled ? poolRate : (rates[vehicleCategory] || rates.CAR);
    return Math.round(distanceKm * rate);
}

/**
 * Fare calculation — same logic as PlanRideScreen.tsx
 */
export function calculateFare(distanceKm, vehicleCategory, isPooled) {
    const bases = { BIKE: 15, AUTO: 25, CAR: 30, BIG_CAR: 45 };
    const perKm = { BIKE: 7, AUTO: 10, CAR: 12, BIG_CAR: 16 };
    let fare = (bases[vehicleCategory] || bases.CAR) + distanceKm * (perKm[vehicleCategory] || perKm.CAR);
    if (isPooled) fare *= 0.67;
    return Math.round(fare);
}

/**
 * Find drivers whose daily route passes within maxDistance km of given point.
 * Same logic as GET /api/rider/match-driver in server/index.js
 */
export async function findMatchingDrivers(lat, lng, maxDistanceKm = 5) {
    const drivers = await User.find({ role: 'DRIVER', 'dailyRoute.isActive': true });
    return drivers.filter((d) => {
        const srcDist = haversineDistance(lat, lng, d.dailyRoute.source.lat, d.dailyRoute.source.lng);
        const dstDist = haversineDistance(lat, lng, d.dailyRoute.destination.lat, d.dailyRoute.destination.lng);
        return srcDist <= maxDistanceKm || dstDist <= maxDistanceKm;
    });
}