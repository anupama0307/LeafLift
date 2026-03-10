const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    // ─── Core References ───
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
        index: true
    },
    reviewerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    revieweeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    reviewerRole: {
        type: String,
        enum: ['RIDER', 'DRIVER'],
        required: true
    },

    // ─── Rating ───
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    // ─── Detailed Ratings (optional sub-scores) ───
    subRatings: {
        safety: { type: Number, min: 1, max: 5 },
        punctuality: { type: Number, min: 1, max: 5 },
        cleanliness: { type: Number, min: 1, max: 5 },
        communication: { type: Number, min: 1, max: 5 },
        navigation: { type: Number, min: 1, max: 5 }
    },

    // ─── Review Content ───
    comment: {
        type: String,
        maxlength: 500,
        default: ''
    },
    tags: [{
        type: String,
        enum: [
            'SAFE_DRIVER', 'CLEAN_CAR', 'ON_TIME', 'FRIENDLY',
            'GREAT_CONVERSATION', 'SMOOTH_RIDE', 'KNOWS_ROUTES',
            'POLITE_RIDER', 'READY_ON_TIME', 'RESPECTFUL',
            'GOOD_DIRECTIONS', 'EXCESSIVE_CANCELLATIONS',
            'RUDE_BEHAVIOR', 'UNSAFE_DRIVING', 'DIRTY_VEHICLE',
            'TOOK_LONGER_ROUTE', 'HARASSING'
        ]
    }],

    // ─── Moderation ───
    isReported: { type: Boolean, default: false },
    reportReason: { type: String, default: '' },
    moderationStatus: {
        type: String,
        enum: ['VISIBLE', 'HIDDEN', 'UNDER_REVIEW'],
        default: 'VISIBLE'
    },
    moderatedAt: { type: Date },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ─── Sentiment Analysis (for admin dashboard) ───
    sentimentScore: {
        type: Number,
        min: -1,
        max: 1,
        default: 0
    },
    sentimentLabel: {
        type: String,
        enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
        default: 'NEUTRAL'
    },

    // ─── Timestamps ───
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Prevent duplicate reviews per ride per reviewer
ReviewSchema.index({ rideId: 1, reviewerId: 1 }, { unique: true });
ReviewSchema.index({ revieweeId: 1, createdAt: -1 });
ReviewSchema.index({ moderationStatus: 1 });

module.exports = mongoose.model('Review', ReviewSchema);
