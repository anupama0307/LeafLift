/**
 * EPIC 3 — Test Setup
 * Shared MongoDB Memory Server + Mongoose models for all EPIC 3 tests.
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
    totalCO2Saved: { type: Number, default: 0 },
    totalCO2Emitted: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    totalKmTraveled: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
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
    co2Emissions: { type: Number, default: 0 },
    co2Saved: { type: Number, default: 0 },
    passengers: { type: Number, default: 1 },
    paymentMethod: String,
    createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
export const Ride = mongoose.models.Ride || mongoose.model('Ride', RideSchema);

// ─── CO₂ & Sustainability Helper Functions ───

/** CO₂ emission rates per vehicle category (g/km) */
export const CO2_RATES = {
    BIKE: 20,
    AUTO: 60,
    CAR: 120,
    BIG_CAR: 180,
};

/** Pooled ride emission rate (g/km) */
export const POOL_RATE = 40;

/**
 * Calculate CO₂ emissions for a ride.
 * Same logic as PlanRideScreen.tsx calculateCO2()
 */
export function calculateCO2(distanceKm, vehicleCategory, isPooled) {
    const rate = isPooled ? POOL_RATE : (CO2_RATES[vehicleCategory] || CO2_RATES.CAR);
    return Math.round(distanceKm * rate);
}

/**
 * Calculate CO₂ saved by choosing pooled over solo.
 */
export function calculateCO2Saved(distanceKm, vehicleCategory) {
    const soloEmissions = calculateCO2(distanceKm, vehicleCategory, false);
    const poolEmissions = calculateCO2(distanceKm, vehicleCategory, true);
    return Math.max(0, soloEmissions - poolEmissions);
}

/**
 * Calculate fare for a ride.
 */
export function calculateFare(distanceKm, vehicleCategory, isPooled) {
    const bases = { BIKE: 15, AUTO: 25, CAR: 30, BIG_CAR: 45 };
    const perKm = { BIKE: 7, AUTO: 10, CAR: 12, BIG_CAR: 16 };
    let fare = (bases[vehicleCategory] || bases.CAR) + distanceKm * (perKm[vehicleCategory] || perKm.CAR);
    if (isPooled) fare *= 0.67;
    return Math.round(fare);
}

/**
 * Convert CO₂ grams to trees-equivalent.
 * 1 tree absorbs ~22 kg CO₂ per year ≈ 60g per day
 */
export function co2ToTrees(co2Grams) {
    const treesPerYear = co2Grams / 22000;
    return Math.round(treesPerYear * 10) / 10;
}

/**
 * Format CO₂ for display (g or kg).
 */
export function formatCO2(grams) {
    if (grams >= 1000) return `${(grams / 1000).toFixed(1)} kg`;
    return `${grams} g`;
}

/**
 * Calculate environmental score (A+ to F) based on pooling rate.
 */
export function getEnvironmentalScore(poolingRate) {
    if (poolingRate >= 70) return 'A+';
    if (poolingRate >= 60) return 'A';
    if (poolingRate >= 50) return 'B+';
    if (poolingRate >= 40) return 'B';
    if (poolingRate >= 30) return 'C';
    if (poolingRate >= 20) return 'D';
    return 'F';
}

/**
 * Aggregate eco stats for a user from their completed rides.
 */
export async function aggregateUserEcoStats(userId) {
    const rides = await Ride.find({ userId, status: 'COMPLETED' });
    let totalCO2Emitted = 0;
    let totalCO2Saved = 0;
    let totalKm = 0;

    rides.forEach((ride) => {
        totalCO2Emitted += ride.co2Emissions || 0;
        totalCO2Saved += ride.co2Saved || 0;
        const distMatch = (ride.distance || '').match(/([\d.]+)/);
        if (distMatch) totalKm += parseFloat(distMatch[1]);
    });

    return {
        totalTrips: rides.length,
        totalCO2Emitted,
        totalCO2Saved,
        totalKmTraveled: Math.round(totalKm * 10) / 10,
    };
}