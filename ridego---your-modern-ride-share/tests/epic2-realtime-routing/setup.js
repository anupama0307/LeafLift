/**
 * EPIC 2 — Test Setup
 * Shared MongoDB Memory Server + Mongoose models for all EPIC 2 tests.
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

// ─── Inline Mongoose Schemas ───

const UserSchema = new mongoose.Schema({
    role: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: { type: String, required: true },
    gender: { type: String, required: true },
    rating: { type: Number, default: 4.8 },
});

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['SYSTEM', 'RIDE', 'PROMO', 'DELAY_ALERT'], default: 'SYSTEM' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
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
    stops: [{
        address: String,
        lat: Number,
        lng: Number,
        order: Number,
        status: { type: String, default: 'PENDING' },
        reachedAt: Date,
    }],
    currentStopIndex: { type: Number, default: 0 },
    fare: Number,
    distance: String,
    duration: String,
    vehicleCategory: { type: String, enum: ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'], default: 'CAR' },
    routeIndex: { type: Number, default: 0 },
    driverLocation: { lat: Number, lng: Number, updatedAt: Date },
    riderLocation: { lat: Number, lng: Number, updatedAt: Date },
    etaToPickup: String,
    etaToDropoff: String,
    originalEtaMinutes: { type: Number, default: null },
    lastDelayAlertAt: { type: Date, default: null },
    co2Emissions: { type: Number, default: 0 },
    co2Saved: { type: Number, default: 0 },
    isPooled: { type: Boolean, default: false },
    otp: String,
    otpVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const Ride = mongoose.models.Ride || mongoose.model('Ride', RideSchema);
export const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

// ─── Shared Helper Functions ───

/**
 * Haversine distance in km — same as server/index.js
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
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
 * Compute ETA in minutes from distance (km) using average speed.
 * Fallback ETA calculation when OLA API is unavailable.
 */
export function computeFallbackEta(distanceKm, avgSpeedKmh = 25) {
    return Math.round((distanceKm / avgSpeedKmh) * 60);
}

/**
 * Check if a delay alert should be sent based on cooldown.
 * Same logic as broadcastLiveEta() in server/index.js
 */
export function shouldSendDelayAlert(currentEtaMin, originalEtaMin, lastAlertAt, cooldownMs = 300000) {
    const delayMin = currentEtaMin - originalEtaMin;
    if (delayMin < 5) return false;
    if (lastAlertAt) {
        const elapsed = Date.now() - new Date(lastAlertAt).getTime();
        if (elapsed < cooldownMs) return false;
    }
    return true;
}

/**
 * Build OLA Directions API request payload.
 * Replicates the logic in POST /api/ola/directions
 */
export function buildOlaDirectionsPayload(origin, destination, waypoints = []) {
    const payload = {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        alternatives: true,
        traffic_metadata: true,
    };
    if (waypoints.length > 0) {
        payload.waypoints = waypoints.map((w) => `${w.lat},${w.lng}`).join('|');
    }
    return payload;
}

/**
 * Parse OLA Directions API response — extract distance, duration, polyline.
 */
export function parseOlaRouteResponse(apiResponse) {
    if (!apiResponse || !apiResponse.routes || apiResponse.routes.length === 0) {
        return [];
    }
    return apiResponse.routes.map((route, idx) => {
        const leg = route.legs && route.legs[0];
        return {
            index: idx,
            distance: (leg && leg.distance && leg.distance.text) || 'N/A',
            distanceMeters: (leg && leg.distance && leg.distance.value) || 0,
            duration: (leg && leg.duration && leg.duration.text) || 'N/A',
            durationSeconds: (leg && leg.duration && leg.duration.value) || 0,
            polyline: route.overview_polyline || '',
        };
    });
}

/**
 * Determine route color based on ride status.
 * Same logic as PlanRideScreen.tsx
 */
export function getRouteColor(status) {
    switch (status) {
        case 'ACCEPTED':
        case 'ARRIVED':
            return '#3B82F6'; // blue
        case 'IN_PROGRESS':
            return '#22C55E'; // green
        default:
            return '#6B7280'; // gray
    }
}