const mongoose = require('mongoose');

const safetyAlertSchema = new mongoose.Schema({
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userRole: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    location: {
        lat: Number,
        lng: Number,
        address: String
    },
    status: { type: String, enum: ['ACTIVE', 'RESOLVED', 'FALSE_ALARM'], default: 'ACTIVE' },
    contactsAlerted: [{
        name: String,
        phone: String,
        status: { type: String, default: 'SENT' }
    }],
    resolvedAt: Date,
    resolvedBy: String,
    notes: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SafetyAlert', safetyAlertSchema);
