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
    pooledRiders: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            fareAdjustment: { type: Number, default: 0 },
            joinedAt: { type: Date, default: Date.now }
        }
    ],
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
    chat: [
        {
            senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            senderRole: String,
            message: String,
            createdAt: { type: Date, default: Date.now }
        }
    ],
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
