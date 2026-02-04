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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Ride', RideSchema);
