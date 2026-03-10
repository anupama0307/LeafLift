const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    // ─── Core References ───
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },

    // ─── Amount ───
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },

    // ─── Fare Breakdown ───
    fareBreakdown: {
        baseFare: { type: Number, default: 0 },
        distanceCharge: { type: Number, default: 0 },
        timeCharge: { type: Number, default: 0 },
        tollCharges: { type: Number, default: 0 },
        surgeMultiplier: { type: Number, default: 1.0 },
        surgeAmount: { type: Number, default: 0 },
        poolDiscount: { type: Number, default: 0 },
        promoDiscount: { type: Number, default: 0 },
        promoCode: { type: String, default: '' },
        cancellationFee: { type: Number, default: 0 },
        taxes: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        driverPayout: { type: Number, default: 0 }
    },

    // ─── Payment Method ───
    method: {
        type: String,
        enum: ['WALLET', 'UPI', 'CARD', 'CASH', 'NET_BANKING'],
        required: true
    },
    methodDetails: {
        upiId: { type: String },
        cardLast4: { type: String },
        cardBrand: { type: String },
        bankName: { type: String },
        transactionRef: { type: String }
    },

    // ─── Status ───
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'],
        default: 'PENDING',
        index: true
    },
    failureReason: { type: String, default: '' },

    // ─── Refund ───
    refundAmount: { type: Number, default: 0 },
    refundReason: { type: String, default: '' },
    refundedAt: { type: Date },
    refundTransactionRef: { type: String },

    // ─── Driver Payout ───
    payoutStatus: {
        type: String,
        enum: ['PENDING', 'PROCESSED', 'FAILED'],
        default: 'PENDING'
    },
    payoutAmount: { type: Number, default: 0 },
    payoutProcessedAt: { type: Date },

    // ─── Timestamps ───
    initiatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Indexes for common queries
PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ driverId: 1, payoutStatus: 1 });

module.exports = mongoose.model('Payment', PaymentSchema);
