const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const EncryptedNumber = {
    type: mongoose.Schema.Types.Mixed,
    set: encrypt,
    get: decrypt
};

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
    licenseUrl: { type: String },
    aadhar: { type: String },
    aadharUrl: { type: String },
    vehicleMake: { type: String },
    vehicleModel: { type: String },
    vehicleNumber: { type: String },
    rating: { type: Number, default: 4.8 },
    isVerified: { type: Boolean, default: false },
    verificationStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    verificationDate: { type: Date },
    upiId: { type: String },
    upiQrCodeUrl: { type: String },
    accessibilitySupport: [String], // e.g. ['Wheelchair', 'Hearing Impaired Assistance']
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
            lat: EncryptedNumber,
            lng: EncryptedNumber
        },
        destination: {
            address: String,
            lat: EncryptedNumber,
            lng: EncryptedNumber
        },
        isActive: { type: Boolean, default: false },
        genderPreference: { type: String, enum: ['Any', 'Male only', 'Female only'], default: 'Any' }
    },
    privacySettings: {
        shareStats: { type: Boolean, default: true },
        publicProfile: { type: Boolean, default: true },
        locationSharing: { type: Boolean, default: true }
    }
}, {
    toJSON: { getters: true },
    toObject: { getters: true }
});


module.exports = mongoose.model('User', userSchema);
