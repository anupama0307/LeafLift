const mongoose = require('mongoose');

const RideSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED'],
        default: 'SEARCHING'
    },
    pickup: {
        address: String,
        lat: Number,
        lng: Number
    },
    dropoff: {
        address: String,
        lat: Number,
        lng: Number
    },
    fare: Number,
    distance: String,
    duration: String,
    rideType: String,
    paymentMethod: String,
    paymentStatus: {
        type: String,
        enum: ['PENDING', 'PAID'],
        default: 'PENDING'
    },
    currentFare: Number,
    routeIndex: {
        type: Number,
        default: 0
    },
    co2Emissions: {
        type: Number,
        default: 0
    },
    co2Saved: {
        type: Number,
        default: 0
    },
    isPooled: {
        type: Boolean,
        default: false
    },
    genderPreference: {
        type: String,
        enum: ['Any', 'Male only', 'Female only'],
        default: 'Any'
    },
    maxPoolSize: {
        type: Number,
        default: 4
    },
    accessibilityOptions: [String],
    safetyOptions: [String],
    pooledRiders: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        firstName: String,
        lastName: String,
        gender: String,
        pickup: { address: String, lat: Number, lng: Number },
        dropoff: { address: String, lat: Number, lng: Number },
        fareAdjustment: { type: Number, default: 0 },
        joinedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ['PENDING_CONSENT', 'APPROVED', 'REJECTED', 'JOINED'], default: 'PENDING_CONSENT' }
    }],
    riderLocation: {
        lat: Number,
        lng: Number,
        updatedAt: Date
    },
    driverLocation: {
        lat: Number,
        lng: Number,
        updatedAt: Date
    },
    etaToPickup: String,
    otp: String,
    otpVerified: {
        type: Boolean,
        default: false
    },
    otpGeneratedAt: Date,
    contact: {
        riderMasked: String,
        driverMasked: String
    },
    chat: [{
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        senderRole: String,
        message: String,
        createdAt: { type: Date, default: Date.now }
    }],
    // Scheduling
    scheduledFor: { type: Date, default: null },
    scheduledForName: { type: String, default: '' },
    scheduledForPhone: { type: String, default: '' },
    isScheduled: { type: Boolean, default: false },
    // Passengers
    passengers: { type: Number, default: 1 },
    maxPassengers: { type: Number, default: 4 },
    // Early termination / partial ride
    actualDropoff: {
        address: String,
        lat: Number,
        lng: Number
    },
    actualDistanceMeters: { type: Number, default: 0 },
    completedFare: { type: Number, default: 0 },
    riderConfirmedComplete: { type: Boolean, default: false },
    // Ride type category
    vehicleCategory: {
        type: String,
        enum: ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'],
        default: 'CAR'
    },
    bookingTime: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Ride', RideSchema);