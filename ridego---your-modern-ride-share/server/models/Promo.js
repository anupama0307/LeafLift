const mongoose = require('mongoose');

const PromoSchema = new mongoose.Schema({
    // ─── Promo Code ───
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 200
    },

    // ─── Discount ───
    discountType: {
        type: String,
        enum: ['PERCENTAGE', 'FLAT'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: null  // null = no cap
    },
    minRideAmount: {
        type: Number,
        default: 0
    },

    // ─── Applicability ───
    applicableTo: {
        type: String,
        enum: ['ALL', 'FIRST_RIDE', 'POOL_ONLY', 'ECO_RIDES', 'SPECIFIC_CATEGORY'],
        default: 'ALL'
    },
    vehicleCategories: [{
        type: String,
        enum: ['BIKE', 'AUTO', 'CAR', 'BIG_CAR']
    }],

    // ─── Limits ───
    maxUsageTotal: {
        type: Number,
        default: null  // null = unlimited
    },
    maxUsagePerUser: {
        type: Number,
        default: 1
    },
    currentUsageCount: {
        type: Number,
        default: 0
    },

    // ─── Usage Tracking ───
    usedBy: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
        discountApplied: { type: Number },
        usedAt: { type: Date, default: Date.now }
    }],

    // ─── Validity ───
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // ─── Metadata ───
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

PromoSchema.index({ code: 1, isActive: 1 });
PromoSchema.index({ validFrom: 1, validUntil: 1 });

module.exports = mongoose.model('Promo', PromoSchema);
