const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    role: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: { type: String, required: true },
    gender: { type: String, required: true },
    authProvider: { type: String, enum: ['email', 'google', 'apple'], default: 'email' },
    photoUrl: { type: String },
    emailVerified: { type: Boolean, default: false },
    // Driver specific fields
    license: { type: String },
    aadhar: { type: String },
    vehicleMake: { type: String },
    vehicleModel: { type: String },
    vehicleNumber: { type: String },
    rating: { type: Number, default: 4.8 },
    // Wallet
    walletBalance: { type: Number, default: 0 },
    // Eco stats
    totalCO2Saved: { type: Number, default: 0 },
    totalCO2Emitted: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    totalKmTraveled: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    // Daily Route
    dailyRoute: {
        source: {
            address: String,
            lat: Number,
            lng: Number
        },
        destination: {
            address: String,
            lat: Number,
            lng: Number
        },
        isActive: { type: Boolean, default: false }
    }
});


module.exports = mongoose.model('User', userSchema);