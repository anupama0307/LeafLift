const mongoose = require('mongoose');

const DisputeSchema = new mongoose.Schema({
    // ─── Core References ───
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        required: true,
        index: true
    },
    raisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    raisedByRole: {
        type: String,
        enum: ['RIDER', 'DRIVER'],
        required: true
    },
    againstUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },

    // ─── Dispute Details ───
    category: {
        type: String,
        enum: [
            'FARE_DISPUTE',
            'WRONG_ROUTE',
            'SAFETY_CONCERN',
            'VEHICLE_CONDITION',
            'DRIVER_BEHAVIOR',
            'RIDER_BEHAVIOR',
            'PAYMENT_ISSUE',
            'LOST_ITEM',
            'CANCELLATION_FEE',
            'OVERCHARGE',
            'RIDE_NOT_COMPLETED',
            'OTHER'
        ],
        required: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 2000
    },
    evidence: [{
        type: { type: String, enum: ['IMAGE', 'DOCUMENT', 'SCREENSHOT'] },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now }
    }],

    // ─── Fare Dispute Specific ───
    fareDetails: {
        chargedAmount: { type: Number },
        expectedAmount: { type: Number },
        disputedAmount: { type: Number }
    },

    // ─── Resolution ───
    status: {
        type: String,
        enum: ['OPEN', 'UNDER_REVIEW', 'AWAITING_RESPONSE', 'RESOLVED', 'CLOSED', 'ESCALATED'],
        default: 'OPEN',
        index: true
    },
    priority: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: 'MEDIUM'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolution: {
        outcome: {
            type: String,
            enum: ['REFUND_FULL', 'REFUND_PARTIAL', 'NO_ACTION', 'WARNING_ISSUED', 'ACCOUNT_SUSPENDED', 'FARE_ADJUSTED'],
            default: null
        },
        refundAmount: { type: Number, default: 0 },
        notes: { type: String, default: '' },
        resolvedAt: { type: Date },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },

    // ─── Messages / Communication Thread ───
    messages: [{
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        senderRole: { type: String, enum: ['RIDER', 'DRIVER', 'ADMIN', 'SYSTEM'] },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],

    // ─── SLA Tracking ───
    responseDeadline: { type: Date },
    resolutionDeadline: { type: Date },
    firstResponseAt: { type: Date },
    slaBreached: { type: Boolean, default: false },

    // ─── Timestamps ───
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

DisputeSchema.index({ status: 1, priority: -1, createdAt: -1 });
DisputeSchema.index({ raisedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', DisputeSchema);
