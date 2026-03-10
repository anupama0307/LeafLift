/**
 * EPIC 5 — Safety & Trust · Test Setup
 * Self-contained setup with inline Mongoose schemas + safety helpers.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

/* ───────── In-memory MongoDB lifecycle ───────── */
let mongoServer;

beforeAll(async() => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async() => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
});

afterEach(async() => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

/* ───────── User Schema (inline) ───────── */
const userSchema = new mongoose.Schema({
    role: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: String,
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    authProvider: { type: String, default: 'email' },
    photoUrl: String,
    emailVerified: { type: Boolean, default: false },
    // Driver docs
    license: String,
    aadhar: String,
    vehicleMake: String,
    vehicleModel: String,
    vehicleNumber: String,
    // Stats
    rating: { type: Number, default: 5.0 },
    walletBalance: { type: Number, default: 0 },
    totalCO2Saved: { type: Number, default: 0 },
    totalCO2Emitted: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    totalKmTraveled: { type: Number, default: 0 },
    // Daily route
    dailyRoute: {
        source: { type: String, default: '' },
        destination: { type: String, default: '' },
    },
    isVerified: { type: Boolean, default: false },
    verificationStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
}, { timestamps: true });

/* ───────── Ride Schema (inline) ───────── */
const rideSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
    duration: Number,
    vehicleCategory: { type: String, enum: ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'], default: 'CAR' },
    co2Emissions: { type: Number, default: 0 },
    co2Saved: { type: Number, default: 0 },
    isPooled: { type: Boolean, default: false },
    // OTP & contact masking
    otp: { type: String, default: '' },
    otpVerified: { type: Boolean, default: false },
    contact: {
        riderMasked: { type: String, default: '' },
        driverMasked: { type: String, default: '' },
    },
    // Chat
    chat: [{
        sender: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
    }],
    // Location tracking
    riderLocation: { lat: Number, lng: Number },
    driverLocation: { lat: Number, lng: Number },
    // Cancellation
    canceledBy: String,
    cancelReason: String,
    canceledAt: Date,
    cancellationFee: Number,
    autoReSearched: { type: Boolean, default: false },
    previousDriverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    safetyPreferences: {
        womenOnly: { type: Boolean, default: false },
        verifiedOnly: { type: Boolean, default: false },
        needsWheelchair: { type: Boolean, default: false },
        wheelchairFriendly: { type: Boolean, default: false },
        genderPreference: { type: String, enum: ['any', 'male', 'female'], default: 'any' }
    },
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Ride = mongoose.models.Ride || mongoose.model('Ride', rideSchema);

/* ───────── Safety Helpers ───────── */

/**
 * Generate a 4-digit OTP string.
 */
export function generateOTP() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Mask a phone number — show first 2 and last 2 digits.
 * e.g. 9876543210 → 98******10
 */
export function maskPhone(phone) {
    if (!phone || phone.length < 4) return '****';
    return phone.slice(0, 2) + '*'.repeat(phone.length - 4) + phone.slice(-2);
}

/**
 * Check whether a user's driver documents are complete.
 */
export function isDriverVerified(user) {
    return !!(user.license && user.aadhar && user.vehicleNumber);
}

/**
 * Generate a share-safe location URL (no PII).
 */
export function generateShareLink(rideId, lat, lng) {
    return `https://leaflift.app/track/${rideId}?lat=${lat}&lng=${lng}`;
}

/**
 * Role guard — returns true if user has required role.
 */
export function hasRole(user, requiredRole) {
    return user && user.role === requiredRole;
}

/**
 * Check gender preference match.
 */
export function matchGenderPreference(rider, driver, womenOnly) {
    if (!womenOnly) return true;
    return rider.gender === 'Female' && driver.gender === 'Female';
}